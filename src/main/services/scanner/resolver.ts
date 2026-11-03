import { join } from 'node:path'

import type { LxtShare, ScanCategory } from '../../../shared/ipc'

import {
  AOI_SHARE,
  AOI_SHIFT_DIRS,
  LXT_SHARES,
  PL_FIXED,
} from '../../../shared/ipc'
import { pickPlShare } from '../discovery/pl'
import { splitMachine } from '../discovery/shortcuts'
import { readDirSafe } from './fsx'
import type { DirReadResult } from './fsx'

/**
 * 机台 → 绝对路径前缀。
 *
 * 各类扫描的差别只在前缀这一段：EL 是「根目录 / 机台 / EL」，
 * 力禧特是「\\IP / 探测出的共享名 / A-01-B」，利珀是「\\IP / 探测出的标识目录 / Matting」。
 * 之后的日期、班次、时段、类型三层完全一致，所以探测、并发、分批、
 * 暂停恢复都能共用一套执行器。
 */
export interface ResolveResult {
  ok: boolean
  /** 可用的路径前缀；ok 为 false 时是空串 */
  base: string
  /** 失败原因；ok 为 true 时为空串 */
  reason: string
  /** 断链发生在哪一层，用于界面精确提示 */
  brokenAt?: 'EL' | '共享名' | '机台标识'
  /**
   * 网络层面的不可达原因：
   * - network：主机不通，多半是没接专用内网
   * - share：主机通了但这台机器上没有可用的共享名
   * - denied：没有访问权限
   */
  unreachable?: 'network' | 'share' | 'denied'
}

/**
 * 前缀之后的层级差异，用声明式描述交给执行器。
 *
 * 默认（EL / 力禧特）是「日期 → 班次 → 时段 → 类型」，利珀在中间和末尾
 * 多了两层固定目录。把这些差异集中在解析器里，执行器只按描述走，
 * 不必为每类扫描各写一份分支。
 */
export interface PathShape {
  /** 日期层目录名；默认就是参数里的 YYYYMMDD，利珀是 YYYY.MM.DD */
  dateDir?: (date: string) => string
  /** 班次层目录名；默认就是参数里的「白班/夜班」，森标 AOI 是 8.5/20.5 */
  shiftDir?: (shift: '白班' | '夜班') => string
  /** 日期层与班次层之间的固定层；利珀是「机台名大写」 */
  betweenDateAndShift?: (machine: string) => string[]
  /** 时段层与类型层之间的固定层；利珀是 Fail */
  betweenSlotAndType?: string[]
  /** 类型层之上是否还有等级层（利珀的 A/B/C），等级取值来自参数 */
  hasLevel?: boolean
  /** 是否有时段层；默认 true。森标 AOI 为 false，班次目录下直接是类型 */
  hasSlots?: boolean
  /** 前缀层读取失败时归属哪一层；默认 EL */
  baseBrokenAt?: 'EL' | '共享名' | '机台标识'
}

export interface MachineResolver {
  readonly category: ScanCategory
  /** 前缀之后的层级描述；不填就是标准的三层 */
  readonly shape?: PathShape
  /** 未配置或配置不完整时给出可读原因，避免扫到一半才发现参数不对 */
  validate: () => string | null
  resolve: (machine: string) => Promise<ResolveResult>
  /**
   * 把类型目录的绝对路径拆成结果里展示的层级。
   *
   * EL 是「机台/EL/日期/班次/时段/类型」，取相对根目录的部分；
   * 力禧特、利珀、森标 AOI 的各机台没有共同根，只能按「厂区/机台/日期/…」拼 ——
   * 复制分组里的「机台」取的是图片自带的 machine 字段，
   * 所以交给解析器自己决定层级，不在复制模块里做特判。
   */
  segments: (machine: string, dir: string) => string[]
}

/** 取绝对路径相对某个前缀的层级，分隔符统一成 / */
const tailOf = (base: string, full: string): string[] => {
  const rest = full
    .slice(base.length)
    .split(/[\\/]+/)
    .filter(Boolean)

  return rest
}

/** EL：单一根目录 + 固定工序层，机台是根目录下的子目录 */
export const createElResolver = (
  rootPath: string,
  entry: string,
): MachineResolver => ({
  category: 'el',
  validate: () => (rootPath ? null : '尚未配置 DC 根目录'),
  resolve: async (machine) => {
    const base = join(rootPath, machine, entry)
    const result = await readDirSafe(base)

    if (result.status === 'ok') return { ok: true, base, reason: '' }

    return {
      ok: false,
      base: '',
      reason:
        result.status === 'unreachable'
          ? `「${machine}」不可达，请检查共享盘连接`
          : `「${machine}/${entry}」不可用`,
      // EL 的路径结构由机台目录决定，共享名缺失就是 EL 目录缺失
      brokenAt: 'EL',
      unreachable: result.status === 'unreachable' ? 'network' : undefined,
    }
  },
  // 机台/EL/日期/班次/时段/类型/x.jpg
  segments: (_machine, dir) => tailOf(rootPath, dir),
})

export interface LxtResolverOptions {
  /** 机台复合键 → 入口里解析出的目标主机 */
  hosts: Map<string, string>
  /** 已缓存的共享名；探到新值时通过 onShare 回写配置 */
  shares: Map<string, LxtShare | null>
  onShare: (machine: string, share: LxtShare, host: string) => void
}

/** 力禧特：每台机器一个 IP，第二层的共享名逐台探测 */
export const LXT_FIXED_DIR = 'A-01-B'

/**
 * 探测一台机器用的是 el 还是 SaveImages。
 *
 * 规则来自现场说明：el 优先；两个都在或都不在都回落 SaveImages。
 * 主机完全不通时返回 network —— 这是最常见的失败（在 EL 网络下扫描），
 * 界面要能把它跟「路径变了」区分开，否则现场只会看到一片「无图片」。
 */
const probeShare = async (
  host: string,
): Promise<{ share: LxtShare | null; unreachable?: 'network' | 'denied' }> => {
  const found: LxtShare[] = []
  let denied = false
  let unreachable = false

  for (const share of LXT_SHARES) {
    const result = await readDirSafe(join(host, share))

    if (result.status === 'ok') found.push(share)
    else if (result.status === 'denied') denied = true
    else if (result.status === 'unreachable') unreachable = true
  }

  // 两个都读到才算「同时存在」，此时按优先级取 el
  if (found.length) return { share: found[0] }

  // 一个都没读到，但其中一次是超时：主机层面就不通
  if (unreachable) return { share: null, unreachable: 'network' }

  return { share: 'SaveImages', ...(denied ? { unreachable: 'denied' } : {}) }
}

export const createLxtResolver = (
  options: LxtResolverOptions,
): MachineResolver => ({
  category: 'lxt',
  validate: () =>
    options.hosts.size ? null : '尚未识别力禧特入口，请先选择并识别入口目录',
  resolve: async (machine) => {
    const host = options.hosts.get(machine)

    if (!host) {
      return {
        ok: false,
        base: '',
        reason: '该机台已不在入口目录中，请重新识别入口',
        brokenAt: '共享名',
      }
    }

    let share = options.shares.get(machine) ?? null
    let unreachable: 'network' | 'denied' | undefined

    if (!share) {
      const probed = await probeShare(host)

      share = probed.share
      unreachable = probed.unreachable

      if (!share) {
        return {
          ok: false,
          base: '',
          reason:
            unreachable === 'network'
              ? `${host} 不可达，需要接入力禧特专用内网`
              : `${host} 上没有找到 el 或 SaveImages 目录`,
          brokenAt: '共享名',
          unreachable: unreachable ?? 'share',
        }
      }

      // 探到了就记下来，下次不用再探
      options.shares.set(machine, share)
      options.onShare(machine, share, host)
    }

    return {
      ok: true,
      base: join(host, share, LXT_FIXED_DIR),
      reason: '',
    }
  },
  // 厂区/机台/日期/班次/时段/类型/x.jpg
  // base 是 \\IP\share\A-01-B，路径上带不了厂区，只能从机台复合键里补
  segments: (machine, dir) => {
    const [plant, name] = splitMachine(machine)
    const host = options.hosts.get(machine) ?? ''
    const share = options.shares.get(machine) ?? ''
    const base = host && share ? join(host, share, LXT_FIXED_DIR) : ''

    return [plant, name, ...(base ? tailOf(base, dir) : [])].filter(Boolean)
  },
})

export interface PlResolverOptions {
  /** 机台复合键 → 入口里解析出的目标主机 */
  hosts: Map<string, string>
  /** 已缓存的标识目录名；探到新值时通过 onShare 回写配置 */
  shares: Map<string, string | null>
  onShare: (machine: string, share: string, host: string) => void
}

/**
 * 探测超时。比扫描阶段的 20 秒短：逐台探标识目录时，每台卡 20 秒
 * 会让「接错网」和「有几台没开机」看起来一模一样。
 */
const PROBE_TIMEOUT_MS = 8_000

/**
 * 探测专用读取：网络闪断时再试一次。
 *
 * 首次连某台机器的共享要先做 SMB 会话协商，慢起来十几秒很常见；
 * 一次超时就判「没接专用内网」会把整批机台带偏，所以重试一次再下结论。
 */
const probeRead = async (path: string): Promise<DirReadResult> => {
  const first = await readDirSafe(path, { timeoutMs: PROBE_TIMEOUT_MS })

  if (first.status !== 'unreachable') return first

  await new Promise((resolve) => setTimeout(resolve, 600))

  return readDirSafe(path, { timeoutMs: PROBE_TIMEOUT_MS })
}

/**
 * 首选形态：`pl-机台名`，机台名原样小写。
 *
 * 现场绝大多数机器就是这个命名（6A → pl-6a），优先级最高：
 * 命中时只花一次读取，不用再去猜补零、厂区前缀这些变体。
 */
const plPrimaryShare = (machineName: string): string | null => {
  const alias = machineName.trim().toLowerCase()

  return alias ? `pl-${alias}` : null
}

/**
 * 精确名 `pl-机台名` 不存在的兜底候选，由线别名按已知命名习惯推出来：
 *   3C  → pl-03c    （个位数字被补了 0）
 *   10B → 东区pl-10b（厂区名做前缀）
 * 这些属于「正则规则能覆盖到的变形」，排在一次命中之后依次试。
 */
const plShareCandidates = (machineName: string, plant: string): string[] => {
  const alias = machineName.trim().toLowerCase()

  if (!alias) return []

  const aliases = /^\d[a-z]$/.test(alias) ? [alias, `0${alias}`] : [alias]

  // pl 前缀的两种写法先试完，再试带厂区前缀的：
  // 补零（pl-03c）比「厂区 + 原样名」常见得多，先试能少一次无效读取
  const names = aliases.map((item) => `pl-${item}`)

  if (plant) names.push(...aliases.map((item) => `${plant}pl-${item}`))

  return [...new Set(names)]
}

/**
 * 探测一台利珀机器用的是哪个标识目录。
 *
 * 不能像 EL 那样直接列 `\\IP` —— 只有主机名、没有共享名的 UNC 根，
 * Windows 的目录枚举会返回 EINVAL/ERROR_BAD_NETPATH，看起来跟「主机不通」
 * 一模一样，现场就变成「路径明明能打开，却提示没接专用内网」。
 *
 * 所以按优先级从小到大试，每次都是一次正常的共享内读取，可达与否按真实
 * 错误码区分：
 *   1. `pl-机台名` 原样命中 —— 最常见，读 `pl-6a\Matting` 一次就能定下来；
 *   2. 正则规则推出的变形（`pl-06a`、`西区pl-6a`）；
 *   3. 都不中才列主机根目录，用边界正则挑最像的那个（兼容改过名的现场）。
 */
const probePlShare = async (
  host: string,
  machineName: string,
  plant: string,
): Promise<{
  share: string | null
  /** 命中的目录是否已经验证过 Matting 层 */
  verified: boolean
  unreachable?: 'network' | 'denied'
  dirs: string[]
  tried: string[]
}> => {
  const primary = plPrimaryShare(machineName)
  const tried: string[] = primary ? [primary] : []
  const candidates = plShareCandidates(machineName, plant).filter(
    (item) => item !== primary,
  )
  let denied = false

  // 一级：精确名优先。读不到（目录不存在）就往下走，先不下结论
  if (primary) {
    const result = await probeRead(join(host, primary, PL_FIXED.matting))

    if (result.status === 'ok') {
      return { share: primary, verified: true, dirs: [], tried }
    }

    if (result.status === 'denied') denied = true

    // 主机层面不通，剩下的候选只会一个个等超时
    if (result.status === 'unreachable') {
      return {
        share: null,
        verified: false,
        dirs: [],
        tried,
        unreachable: 'network',
      }
    }
  }

  // 二级：正则规则推出的变体
  for (const candidate of candidates) {
    tried.push(candidate)

    const result = await probeRead(join(host, candidate, PL_FIXED.matting))

    if (result.status === 'ok') {
      return { share: candidate, verified: true, dirs: [], tried }
    }

    if (result.status === 'denied') {
      // 共享存在但没权限，说明主机是通的
      denied = true
      continue
    }

    if (result.status === 'unreachable') {
      return {
        share: null,
        verified: false,
        dirs: [],
        tried,
        unreachable: 'network',
      }
    }
  }

  // 三级：名字都猜不中，才去列主机根目录，用边界正则挑
  const listing = await probeRead(host)

  if (listing.status === 'ok') {
    return {
      share: pickPlShare(listing.dirs, machineName),
      verified: false,
      dirs: listing.dirs,
      tried,
      ...(denied ? { unreachable: 'denied' as const } : {}),
    }
  }

  if (denied || listing.status === 'denied') {
    return {
      share: null,
      verified: false,
      dirs: [],
      tried,
      unreachable: 'denied',
    }
  }

  return {
    share: null,
    verified: false,
    dirs: [],
    tried,
    unreachable: listing.status === 'unreachable' ? 'network' : undefined,
  }
}

/** 利珀：每台机器一个 IP，第二层标识目录逐台探测 */
export const createPlResolver = (
  options: PlResolverOptions,
): MachineResolver => ({
  category: 'pl',
  // {地址}\{标识}\Matting\{日期}\{机台名}\{班次}\{时段}\Fail\{等级}\{类型}
  shape: {
    // 现场日期目录是 2026.10.28，参数里传的是 YYYYMMDD
    dateDir: (date) =>
      `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)}`,
    // 日期下面还有一层机台名，是线别名的大写形式
    betweenDateAndShift: (machine) => [splitMachine(machine)[1].toUpperCase()],
    betweenSlotAndType: [PL_FIXED.fail],
    hasLevel: true,
  },
  validate: () =>
    options.hosts.size ? null : '尚未识别利珀入口，请先选择并识别入口目录',
  resolve: async (machine) => {
    const host = options.hosts.get(machine)

    if (!host) {
      return {
        ok: false,
        base: '',
        reason: '该机台已不在入口目录中，请重新识别入口',
        brokenAt: '机台标识',
      }
    }

    const [plant, name] = splitMachine(machine)
    const cached = options.shares.get(machine) ?? null

    /**
     * 探一轮标识目录：猜名字 → 命中 → 校验 Matting 层。
     * 校验不过的目录不能写进缓存，否则这台机器之后每次都停在「路径不存在」。
     */
    const discover = async (): Promise<
      { share: string } | { failure: ResolveResult }
    > => {
      const probed = await probePlShare(host, name, plant)
      const unreachable = probed.unreachable

      if (!probed.share) {
        const tried = probed.tried.length
          ? `已试：${probed.tried.join('、')}；`
          : ''

        return {
          failure: {
            ok: false,
            base: '',
            reason:
              unreachable === 'network'
                ? `${host} 不可达，需要接入利珀专用内网`
                : unreachable === 'denied'
                  ? `没有读取 ${host} 的权限`
                  : `${host} 上没有找到与「${name}」匹配的标识目录（${tried}实际存在：${
                      probed.dirs.slice(0, 6).join('、') || '（未列出）'
                    }）`,
            brokenAt: '机台标识',
            unreachable: unreachable ?? 'share',
          },
        }
      }

      if (!probed.verified) {
        const matting = await probeRead(
          join(host, probed.share, PL_FIXED.matting),
        )

        if (matting.status !== 'ok') {
          return {
            failure: {
              ok: false,
              base: '',
              reason: `「${host}\\${probed.share}」下没有 ${PL_FIXED.matting} 目录，标识目录可能已改名`,
              brokenAt: '机台标识',
              unreachable:
                matting.status === 'denied'
                  ? 'denied'
                  : matting.status === 'unreachable'
                    ? 'network'
                    : undefined,
            },
          }
        }
      }

      return { share: probed.share }
    }

    let share = cached

    // 缓存里的标识目录是早先探测的结果，可能是记错的（旧版本按「包含别名」
    // 匹配会记成 pl-19a 这种）。先验一次 Matting，过不了就清掉重探，
    // 别让一台机器一直错到用户手动改配置为止。
    if (share) {
      const matting = await probeRead(join(host, share, PL_FIXED.matting))

      if (matting.status === 'ok') {
        return {
          ok: true,
          base: join(host, share, PL_FIXED.matting),
          reason: '',
        }
      }

      if (matting.status === 'unreachable') {
        return {
          ok: false,
          base: '',
          reason: `${host} 不可达，需要接入利珀专用内网`,
          brokenAt: '机台标识',
          unreachable: 'network',
        }
      }

      options.shares.set(machine, null)
      share = null
    }

    const found = await discover()

    if ('failure' in found) return found.failure

    if (found.share !== cached) {
      // 探到了就记下来，下次不用再探
      options.shares.set(machine, found.share)
      options.onShare(machine, found.share, host)
    }

    return {
      ok: true,
      base: join(host, found.share, PL_FIXED.matting),
      reason: '',
    }
  },
  // 厂区/机台/日期/机台名/班次/时段/等级/类型/x.jpg
  // base 是 \\IP\{标识}\Matting，路径上带不了厂区，只能从机台复合键里补；
  // 中间那层 Fail 是所有机台共有的固定层，展示时省略
  segments: (machine, dir) => {
    const [plant, name] = splitMachine(machine)
    const host = options.hosts.get(machine) ?? ''
    const share = options.shares.get(machine) ?? ''
    const base = host && share ? join(host, share, PL_FIXED.matting) : ''
    const tail = base
      ? tailOf(base, dir).filter((segment) => segment !== PL_FIXED.fail)
      : []

    return [plant, name, ...tail].filter(Boolean)
  },
})

export interface AoiResolverOptions {
  /** 机台复合键 → 入口里解析出的目标主机 */
  hosts: Map<string, string>
}

/**
 * 森标 AOI：每台机器一个 IP，第二层固定 SaveImages。
 *
 * 这里刻意不做目录读取：`base` 交给执行器的 this.read() 去读，
 * 这样主机不可达会计入断网熔断；同时也避免枚举只有主机的 `\\IP` 根目录
 * （Windows 对它返回 EINVAL，表现和断网一模一样）。
 */
export const createAoiResolver = (
  options: AoiResolverOptions,
): MachineResolver => ({
  category: 'aoi',
  // \\IP\SaveImages\{日期}\{8.5|20.5}\{类型}\x.jpg
  shape: {
    shiftDir: (shift) => AOI_SHIFT_DIRS[shift],
    hasSlots: false,
    baseBrokenAt: '共享名',
  },
  validate: () =>
    options.hosts.size ? null : '尚未识别森标 AOI 入口，请先选择并识别入口目录',
  resolve: async (machine) => {
    const host = options.hosts.get(machine)

    if (!host) {
      return {
        ok: false,
        base: '',
        reason: '该机台已不在入口目录中，请重新识别入口',
        brokenAt: '共享名',
      }
    }

    return {
      ok: true,
      base: join(host, AOI_SHARE),
      reason: '',
    }
  },
  // 厂区/机台/日期/8.5|20.5/类型/x.jpg
  segments: (machine, dir) => {
    const [plant, name] = splitMachine(machine)
    const host = options.hosts.get(machine) ?? ''
    const base = host ? join(host, AOI_SHARE) : ''

    return [plant, name, ...(base ? tailOf(base, dir) : [])].filter(Boolean)
  },
})
