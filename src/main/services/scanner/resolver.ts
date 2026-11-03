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
  /** 已缓存的共享名；null 表示尚未确定，成功探测或确认失效时通过 onShare 回写 */
  shares: Map<string, LxtShare | null>
  /** 本次扫描日期 YYYYMMDD，用于比较 A-01-B 下的日期目录 */
  date: string
  /** 共享名发生变化（包括清空为 null）时回写配置 */
  onShare: (machine: string, share: LxtShare | null, host: string) => void
}

/** 力禧特：每台机器一个 IP，第二层的共享名逐台探测 */
export const LXT_FIXED_DIR = 'A-01-B'

/**
 * 探测超时。比扫描阶段的 20 秒短：逐台探共享名时，每台卡 20 秒
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

/** 日期目录名；A-01-B 下除日期外可能还有别的目录，只认这种 */
const LXT_DATE_DIR = /^\d{8}$/

/** 近 30 天窗口，按任务日期往前推 */
const LXT_RECENT_DAYS = 30
const DAY_MS = 86_400_000

/** 把 YYYYMMDD 解析成 UTC 时间戳；非法日期返回 null，避免本地时区偏移 */
const parseLxtDate = (value: string): number | null => {
  if (!LXT_DATE_DIR.test(value)) return null

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const stamp = Date.UTC(year, month - 1, day)
  const date = new Date(stamp)
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day

  return valid ? stamp : null
}

interface LxtCandidate {
  share: LxtShare
  status: DirReadResult['status']
  /** 是否包含本次扫描日期 */
  hasTaskDate: boolean
  /** 是否在任务日期往前 30 天内有数据 */
  hasRecentDate: boolean
}

/**
 * 读一次 `\\host\<share>\A-01-B`。
 *
 * 共享根存在不代表路径可用：现场出现过 SaveImages 根可读、A-01-B 不存在，
 * 而 el 下正常的情况。这里直接读固定层，读到的子目录就是日期。
 */
const readLxtCandidate = async (
  host: string,
  share: LxtShare,
  taskDate: string,
): Promise<LxtCandidate> => {
  const result = await probeRead(join(host, share, LXT_FIXED_DIR))
  const dates =
    result.status === 'ok'
      ? result.dirs.filter((name) => LXT_DATE_DIR.test(name))
      : []

  const taskStamp = parseLxtDate(taskDate)
  const floor = taskStamp === null ? null : taskStamp - LXT_RECENT_DAYS * DAY_MS
  const hasRecentDate =
    taskStamp !== null &&
    floor !== null &&
    dates.some((name) => {
      const stamp = parseLxtDate(name)
      return stamp !== null && stamp >= floor && stamp <= taskStamp
    })

  return {
    share,
    status: result.status,
    hasTaskDate: dates.includes(taskDate),
    hasRecentDate,
  }
}

/**
 * 两个候选都可用时的选择：
 * 本次日期优先 → 只有一边近 30 天有数据就选它 → 否则（都近、都旧、都没有）
 * 固定为 SaveImages。
 */
const pickLxtShare = (candidates: LxtCandidate[]): LxtShare | null => {
  const usable = candidates.filter((item) => item.status === 'ok')

  if (!usable.length) return null
  if (usable.length === 1) return usable[0].share

  const withTaskDate = usable.filter((item) => item.hasTaskDate)
  if (withTaskDate.length === 1) return withTaskDate[0].share
  if (withTaskDate.length === 2) return 'SaveImages'

  const recent = usable.filter((item) => item.hasRecentDate)
  if (recent.length === 1) return recent[0].share

  return 'SaveImages'
}

/** 没有可用候选时，按网络 / 权限 / 路径缺失的优先级给出可读原因 */
const lxtFailure = (
  host: string,
  candidates: LxtCandidate[],
  cached?: LxtShare,
): ResolveResult => {
  if (candidates.some((item) => item.status === 'unreachable')) {
    return {
      ok: false,
      base: '',
      reason: `${host} 不可达，需要接入力禧特专用内网`,
      brokenAt: '共享名',
      unreachable: 'network',
    }
  }

  if (candidates.some((item) => item.status === 'denied')) {
    return {
      ok: false,
      base: '',
      reason: `没有读取 ${host} 的权限`,
      brokenAt: '共享名',
      unreachable: 'denied',
    }
  }

  return {
    ok: false,
    base: '',
    reason: cached
      ? `缓存的共享名 ${cached} 已不可用，且没有找到 el / SaveImages 的 ${LXT_FIXED_DIR} 目录`
      : `${host} 上 el 与 SaveImages 都没有 ${LXT_FIXED_DIR} 目录`,
    brokenAt: '共享名',
    unreachable: 'share',
  }
}

export const createLxtResolver = (
  options: LxtResolverOptions,
): MachineResolver => {
  const ok = (host: string, share: LxtShare): ResolveResult => ({
    ok: true,
    base: join(host, share, LXT_FIXED_DIR),
    reason: '',
  })

  const persist = (
    machine: string,
    host: string,
    share: LxtShare | null,
  ): void => {
    options.shares.set(machine, share)
    options.onShare(machine, share, host)
  }

  return {
    category: 'lxt',
    shape: { baseBrokenAt: '共享名' },
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

      const cached = options.shares.get(machine) ?? null

      if (!cached) {
        const candidates = await Promise.all(
          LXT_SHARES.map((share) =>
            readLxtCandidate(host, share, options.date),
          ),
        )
        const picked = pickLxtShare(candidates)

        if (!picked) return lxtFailure(host, candidates)

        persist(machine, host, picked)
        return ok(host, picked)
      }

      const current = await readLxtCandidate(host, cached, options.date)

      // 缓存可用且包含本次日期：固定使用，不再为另一边多付一次探测
      if (current.status === 'ok' && current.hasTaskDate) {
        return ok(host, cached)
      }

      const otherShare: LxtShare = cached === 'el' ? 'SaveImages' : 'el'
      const other = await readLxtCandidate(host, otherShare, options.date)

      if (current.status === 'ok') {
        if (other.status === 'ok') {
          const picked = pickLxtShare([current, other])
          if (!picked) return lxtFailure(host, [current, other], cached)
          if (picked !== cached) persist(machine, host, picked)
          return ok(host, picked)
        }

        // 另一边不可用，缓存是唯一可用的一边
        return ok(host, cached)
      }

      // 缓存暂时不可达：优先尝试另一边，但不要急着清掉缓存
      if (current.status === 'unreachable') {
        if (other.status === 'ok') {
          persist(machine, host, other.share)
          return ok(host, other.share)
        }

        return lxtFailure(host, [current, other], cached)
      }

      // missing / denied / 其它路径错误：缓存确认失效，清空后重探另一边
      if (other.status === 'ok') {
        persist(machine, host, other.share)
        return ok(host, other.share)
      }

      persist(machine, host, null)
      return lxtFailure(host, [current, other], cached)
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
  }
}

export interface PlResolverOptions {
  /** 机台复合键 → 入口里解析出的目标主机 */
  hosts: Map<string, string>
  /** 已缓存的标识目录名；探到新值时通过 onShare 回写配置 */
  shares: Map<string, string | null>
  onShare: (machine: string, share: string, host: string) => void
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
