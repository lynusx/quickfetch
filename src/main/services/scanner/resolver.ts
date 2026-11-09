import { join } from 'node:path'

import type {
  AoiImageKind,
  LxtShare,
  ScanCategory,
  ShareState,
} from '../../../shared/ipc'
import {
  AOI_IMAGE_DIRS,
  AOI_SHIFT_DIRS,
  DEFAULT_AOI_IMAGE_KIND,
  LXT_SHARES,
  PL_FIXED,
} from '../../../shared/ipc'
import { splitMachine } from '../discovery/shortcuts'
import { readDirSafe } from './fsx'
import { classifyFailureStatuses, describePrefixFailure } from './diagnosis'
import { readShareCandidate } from './shareProbe'
import type { DirectoryReader } from './shareProbe'
import type { DirReadResult } from './fsx'
import { logger } from '../log'

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
   * - network：主机不通，多半是没连 JA-PDA
   * - auth：读得到主机但读不到共享，多半是没认证
   * - share：主机通了但这台机器上没有可用的共享名
   * - denied：没有访问权限
   */
  unreachable?: 'network' | 'share' | 'denied' | 'auth'
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
  /**
   * 前缀层第一次读取的超时上限。
   *
   * 森标 AOI 大量机台未认证，直接读 `\\IP\SaveImages` 时 Windows 只会返回
   * UNKNOWN，但一次 SMB 往返可能要等满默认的 20 秒。把它压到几秒，
   * 未认证/离线的机台就能快速定性并跳过，不再逐层拼接深层路径。
   * 不设时沿用扫描器的自适应超时。
   */
  baseReadTimeoutMs?: number
  /** 前缀层目录名，用于「SaveImages 目录不存在」这类短文案；不设则按层名兜底 */
  baseName?: string
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

    // 三种失败方向完全不同：没连网、没认证、目录真的不在。
    // 分类与文案统一走 diagnosis，避免与执行器的失败阶梯分叉。
    const failure = describePrefixFailure({
      statuses: [result.status],
      layer: 'EL',
      network: { subject: machine, quote: true },
      auth: { subject: base, quote: true },
      denied: { subject: `${machine}/${entry}`, quote: true },
    })

    if (failure) return failure

    return {
      ok: false,
      base: '',
      reason: `「${machine}/${entry}」不存在`,
      // EL 的路径结构由机台目录决定，共享名缺失就是 EL 目录缺失
      brokenAt: 'EL',
    }
  },
  // 机台/EL/日期/班次/时段/类型/x.jpg
  segments: (_machine, dir) => tailOf(rootPath, dir),
})

export interface LxtResolverOptions {
  /** 机台复合键 → 入口里解析出的目标主机 */
  hosts: Map<string, string>
  /**
   * 已缓存的共享名。三态：null 未探测、'' 探过但两边都没有、其余为名字。
   * 探测结果（包括空串）通过 onShare 回写配置。
   */
  shares: Map<string, ShareState<LxtShare>>
  /** 本次扫描日期 YYYYMMDD，用于比较 A-01-B 下的日期目录 */
  date: string
  /** 共享名发生变化（包括清空）时回写配置 */
  onShare: (machine: string, share: ShareState<LxtShare>, host: string) => void
  /** 目录读取注入；缺省走真实 fs，测试用它锁定探测路径与调用次数 */
  read?: DirectoryReader
}

/** 力禧特：每台机器一个 IP，第二层的共享名逐台探测 */
export const LXT_FIXED_DIR = 'A-01-B'

/** 日期目录名；A-01-B 下除日期外可能还有别的目录，只认这种 */
const LXT_DATE_DIR = /^\d{8}$/

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
  /** 共享根 \\host\share 单独一次的读取状态；它才是判「没认证」的依据 */
  rootStatus: DirReadResult['status']
  /** 是否包含本次扫描日期 */
  hasTaskDate: boolean
  /** 是否在任务日期往前 30 天内有数据 */
  hasRecentDate: boolean
}

/**
 * 读一次 `\\host\<share>\A-01-B`，先验共享根再验固定层。
 *
 * 分两步的必要性：直接读 `\\host\share\A-01-B` 时，共享根本没认证、
 * 路径不存在、网络断这三种情况全都报同一个错，代码没办法区分，
 * 于是把「没认证」说成了「这台机器上没有 A-01-B 目录」——
 * 现场拿着这句话去翻目录，当然翻不到问题。
 *
 * 先读共享根，就能把「共享这一层就没读通」和「共享通了但没有 A-01-B」
 * 分开说，前者引导去认证，后者才是真的目录缺失。
 */
const readLxtCandidate = async (
  host: string,
  share: LxtShare,
  taskDate: string,
  read?: DirectoryReader,
): Promise<LxtCandidate> => {
  return readShareCandidate({
    host,
    share,
    child: LXT_FIXED_DIR,
    taskDate,
    parseDate: parseLxtDate,
    read,
  })
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

/**
 * 单独探一台力禧特机台的共享名，供"重新探测共享"按钮使用。
 *
 * 与扫描里的调用同一个函数，保证手动重探与自动探测的判定完全一致 ——
 * 两套逻辑各写一遍迟早会分叉，那时用户点按钮得到的结果和扫描对不上。
 *
 * 返回三态：名字 / ''（探过，两边都没有）/ null（读不通，结论不确定）。
 * null 时调用方不要覆盖旧缓存，下次扫描或重探还会再试。
 */
export const probeLxtShare = async (
  host: string,
  date: string,
  read?: DirectoryReader,
): Promise<ShareState<LxtShare>> => {
  const candidates = await Promise.all(
    LXT_SHARES.map((share) => readLxtCandidate(host, share, date, read)),
  )

  const picked = pickLxtShare(candidates)

  logger.debug('resolver', 'lxt.share.probe', () => ({
    host,
    date,
    candidates: candidates.map((item) => ({
      share: item.share,
      status: item.status,
      rootStatus: item.rootStatus,
      hasTaskDate: item.hasTaskDate,
      hasRecentDate: item.hasRecentDate,
    })),
    picked,
  }))

  if (picked) return picked

  const failure = classifyFailureStatuses(
    candidates.map((item) => item.rootStatus),
  )

  return failure.reason ? null : ''
}

/**
 * 单独探一台利珀机台的标识目录。
 *
 * 与 probePlCandidates 走同一套候选与挑选规则；不再枚举 `\\IP` 主机根 ——
 * Windows 对只有主机的 UNC 根只会返回 EINVAL/ERROR_BAD_NETPATH，
 * 既列不出共享，也会在未认证时白等一轮超时。
 */
export const probePlShare = async (
  host: string,
  machineName: string,
  plant: string,
  date: string,
  read?: DirectoryReader,
): Promise<ShareState> => {
  const names = plShareCandidates(machineName, plant)
  const probed = await Promise.all(
    names.map((name, index) => readPlCandidate(host, name, date, index, read)),
  )

  const picked = pickPlCandidate(probed)

  logger.debug('resolver', 'pl.share.probe', () => ({
    host,
    machineName,
    plant,
    date,
    candidates: probed.map((item) => ({
      share: item.share,
      status: item.status,
      rootStatus: item.rootStatus,
      hasTaskDate: item.hasTaskDate,
      hasRecentDate: item.hasRecentDate,
    })),
    picked,
  }))

  if (picked) return picked

  const failure = classifyFailureStatuses(probed.map((item) => item.rootStatus))

  return failure.reason ? null : ''
}

/**
 * 没有可用候选时给出可读原因。
 *
 * 顺序按「问题出在哪一层」排，越靠近主机越优先：
 * 主机不通 → 共享没认证/没权限 → 共享通了但没有 A-01-B。
 * 关键是最后一条只有在**共享根确实读通了**时才敢说，
 * 否则就是拿猜测冒充结论。
 */
const lxtFailure = (
  host: string,
  candidates: LxtCandidate[],
  cached?: LxtShare | null,
): ResolveResult => {
  const failure = describePrefixFailure({
    statuses: candidates.map((item) => item.rootStatus),
    layer: '共享名',
    network: { subject: host },
    auth: { subject: host, style: 'share-unreadable' },
    denied: { subject: host, between: ' 共享' },
  })

  if (failure) return failure

  // 走到这里说明至少有一个共享根是通的，才有资格说「没有 A-01-B」
  const tried = candidates.map((item) => item.share).join(' / ')

  return {
    ok: false,
    base: '',
    reason: cached
      ? `${host} 上缓存的共享名 ${cached} 已不可用，${tried} 下都没有 ${LXT_FIXED_DIR} 目录`
      : `${host} 上 ${tried} 都没有 ${LXT_FIXED_DIR} 目录`,
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
    share: ShareState<LxtShare>,
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

      // 已探过并确认两边都没有：不再重复探测。
      // 以前空缓存会被当成"没探过"，46 台每次扫描都白等一轮超时，
      // 结论却还是同一个 —— 现场的感受就是"每次都要卡好几分钟"。
      if (cached === '') {
        return {
          ok: false,
          base: '',
          reason: `${host} 上 el 与 SaveImages 都没有 ${LXT_FIXED_DIR} 目录；若共享名近期改过，请点「重新探测共享」`,
          brokenAt: '共享名',
          unreachable: 'share',
        }
      }

      if (!cached) {
        const candidates = await Promise.all(
          LXT_SHARES.map((share) =>
            readLxtCandidate(host, share, options.date, options.read),
          ),
        )
        const picked = pickLxtShare(candidates)
        const failure = lxtFailure(host, candidates)

        logger.debug('resolver', 'lxt.share.auto', () => ({
          machine,
          host,
          date: options.date,
          candidates: candidates.map((item) => ({
            share: item.share,
            status: item.status,
            rootStatus: item.rootStatus,
            hasTaskDate: item.hasTaskDate,
          })),
          picked,
          unreachable: failure.unreachable,
        }))

        if (!picked) {
          // 只有"共享读通了但没有 A-01-B"这个结论才值得落盘；
          // 没认证 / 断网只是暂时的，写死空串会让用户连好网后也扫不出来
          if (failure.unreachable === 'share') persist(machine, host, '')

          return failure
        }

        persist(machine, host, picked)
        return ok(host, picked)
      }

      const current = await readLxtCandidate(
        host,
        cached,
        options.date,
        options.read,
      )

      // 缓存可用且包含本次日期：固定使用，不再为另一边多付一次探测
      if (current.status === 'ok' && current.hasTaskDate) {
        return ok(host, cached)
      }

      const otherShare: LxtShare = cached === 'el' ? 'SaveImages' : 'el'
      const other = await readLxtCandidate(
        host,
        otherShare,
        options.date,
        options.read,
      )

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

      if (other.status === 'ok') {
        persist(machine, host, other.share)
        return ok(host, other.share)
      }

      const failure = lxtFailure(host, [current, other], cached)

      // 缓存确认失效：只有"两边都真的没有 A-01-B"才写成空串。
      // 没认证时保持 null，下次扫描（认证之后）还会再探一次。
      persist(machine, host, failure.unreachable === 'share' ? '' : cached)

      return failure
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
  /**
   * 已缓存的标识目录。三态同力禧特：null 未探测、'' 探过但没有、其余为名字。
   */
  shares: Map<string, ShareState>
  /** 本次扫描日期 YYYYMMDD，用于比较 Matting 下的日期目录 */
  date: string
  /** 标识目录发生变化（包括清空）时回写配置 */
  onShare: (machine: string, share: ShareState, host: string) => void
  /** 目录读取注入；缺省走真实 fs，测试用它锁定探测路径与调用次数 */
  read?: DirectoryReader
}

/**
 * 线别名 → 标识目录候选，按优先级排序：
 *   3C  → pl-3c、pl-03c    （个位数字可能补了 0）
 *   10B → pl-10b、东区pl-10b（可能带厂区前缀）
 *
 * 这些候选会全部探测（不再首个命中即返回），顺序用于日期/近况相同时的平局。
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

/** PL 的日期目录常见形态是 2026.11.02，也兼容 20261102 */
const PL_DATE_DIR = /^(\d{4})\.(\d{2})\.(\d{2})$/
const PL_COMPACT_DATE = /^(\d{4})(\d{2})(\d{2})$/

/** 把 PL 日期目录解析成 UTC 时间戳；非法/非日期目录返回 null */
const parsePlDate = (value: string): number | null => {
  const match = PL_DATE_DIR.exec(value) ?? PL_COMPACT_DATE.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const stamp = Date.UTC(year, month - 1, day)
  const date = new Date(stamp)
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day

  return valid ? stamp : null
}

interface PlCandidate {
  share: string
  /** 候选优先级，越小越优先：缓存 0，候选名按 plShareCandidates 顺序，主机根兜底最后 */
  order: number
  status: DirReadResult['status']
  /** 标识目录本身（不含 Matting）的读取状态，用来区分「没认证」与「没这个目录」 */
  rootStatus: DirReadResult['status']
  hasTaskDate: boolean
  hasRecentDate: boolean
}

/** 读一次 \\host\<标识>\Matting，同时验证固定层并拿到日期目录 */
const readPlCandidate = (
  host: string,
  share: string,
  taskDate: string,
  order: number,
  read?: DirectoryReader,
): Promise<PlCandidate> =>
  readShareCandidate({
    host,
    share,
    child: PL_FIXED.matting,
    taskDate,
    parseDate: parsePlDate,
    order,
    read,
  })

/** 多个候选可用时：本次日期优先 → 近30天 → 候选顺序（缓存/首选名靠前） */
const pickPlCandidate = (candidates: PlCandidate[]): string | null => {
  const usable = candidates
    .filter((item) => item.status === 'ok')
    .sort((a, b) => a.order - b.order)

  if (!usable.length) return null

  const withTaskDate = usable.find((item) => item.hasTaskDate)
  if (withTaskDate) return withTaskDate.share

  const recent = usable.find((item) => item.hasRecentDate)
  if (recent) return recent.share

  return usable[0].share
}

interface PlProbeResult {
  candidates: PlCandidate[]
  tried: string[]
}

/**
 * 探测一台机器的标识目录。
 *
 * 与力禧特同样的思路：
 * - 不把第一个命中的候选当终局，收集所有可读候选，按任务日期/近30天选择；
 * - 某个候选 unreachable 不立即放弃，其他候选可能仍然可用；
 * - 缓存候选也参与比较，缓存可用且含本次日期时直接返回。
 */
const probePlCandidates = async (
  host: string,
  machineName: string,
  plant: string,
  taskDate: string,
  cached: string | null,
  read?: DirectoryReader,
): Promise<PlProbeResult> => {
  const candidates: PlCandidate[] = []
  const tried: string[] = []

  if (cached) {
    const current = await readPlCandidate(host, cached, taskDate, 0, read)
    candidates.push(current)
    tried.push(cached)

    // 缓存命中所选日期：直接采信，不再探测其他候选。
    // 以前即使命中也要把所有候选跑一遍，46 台 × 4 个候选 = 184 次网络往返，
    // 现场感受就是"扫描起步要等半分钟"。
    if (current.status === 'ok' && current.hasTaskDate) {
      return { candidates, tried }
    }
  }

  const names = plShareCandidates(machineName, plant).filter(
    (name) => name !== cached,
  )
  const probed = await Promise.all(
    names.map((name, index) =>
      readPlCandidate(host, name, taskDate, index + 1, read),
    ),
  )
  candidates.push(...probed)
  tried.push(...names)

  // 只探已知候选名。不再枚举 `\\IP` 主机根：Windows 对只有主机的 UNC 根
  // 只会返回 EINVAL/ERROR_BAD_NETPATH，列不出共享，未认证时还要白等超时。
  return { candidates, tried }
}

/** 没有可用候选时，按「主机 → 认证 → 权限 → 目录缺失」的层级给出原因 */
const plFailure = (
  host: string,
  machineName: string,
  probe: PlProbeResult,
  cached: string | null,
): ResolveResult => {
  const failure = describePrefixFailure({
    statuses: probe.candidates.map((item) => item.rootStatus),
    layer: '机台标识',
    network: { subject: host },
    auth: { subject: host, style: 'share-unreadable' },
    denied: { subject: host },
  })

  if (failure) return failure

  // 只有标识目录确实能进去、里面却没有 Matting 或日期时，才说「没找到」
  const tried = probe.tried.length ? `已试：${probe.tried.join('、')}；` : ''

  return {
    ok: false,
    base: '',
    reason: cached
      ? `缓存的标识目录 ${cached} 已不可用，且没有找到与「${machineName}」匹配的标识目录（${tried}可点「重新探测共享」）`
      : `${host} 上没有找到与「${machineName}」匹配的标识目录（${tried}可点「重新探测共享」）`,
    brokenAt: '机台标识',
    unreachable: 'share',
  }
}

/** 利珀：每台机器一个 IP，第二层标识目录逐台探测 */
export const createPlResolver = (
  options: PlResolverOptions,
): MachineResolver => {
  const ok = (host: string, share: string): ResolveResult => ({
    ok: true,
    base: join(host, share, PL_FIXED.matting),
    reason: '',
  })

  const persist = (machine: string, host: string, share: ShareState): void => {
    options.shares.set(machine, share)
    options.onShare(machine, share, host)
  }

  return {
    category: 'pl',
    // {地址}\{标识}\Matting\{日期}\{机台名}\{班次}\{时段}\Fail\{等级}\{类型}
    shape: {
      // 现场日期目录是 2026.10.28，参数里传的是 YYYYMMDD
      dateDir: (date) =>
        `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)}`,
      // 日期下面还有一层机台名，是线别名的大写形式
      betweenDateAndShift: (machine) => [
        splitMachine(machine)[1].toUpperCase(),
      ],
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

      // 已探过并确认没有可用的标识目录：不再重探，只提示可能改名了。
      // 真机 46 台里 4 台是这种情况，以前每次扫描都要为它们多等一轮。
      if (cached === '') {
        return {
          ok: false,
          base: '',
          reason: `${host} 上没有找到与「${name}」匹配的标识目录；若目录近期改过名，请点「重新探测共享」`,
          brokenAt: '机台标识',
          unreachable: 'share',
        }
      }

      const probe = await probePlCandidates(
        host,
        name,
        plant,
        options.date,
        cached,
        options.read,
      )
      const picked = pickPlCandidate(probe.candidates)
      const cachedResult = cached
        ? probe.candidates.find((item) => item.share === cached)
        : undefined

      if (picked) {
        if (picked !== cached) persist(machine, host, picked)
        return ok(host, picked)
      }

      const failure = plFailure(host, name, probe, cached)

      logger.debug('resolver', 'pl.share.auto', () => ({
        machine,
        host,
        date: options.date,
        cached,
        candidates: probe.candidates.map((item) => ({
          share: item.share,
          status: item.status,
          rootStatus: item.rootStatus,
          hasTaskDate: item.hasTaskDate,
        })),
        picked,
        unreachable: failure.unreachable,
      }))

      // 只有"标识目录确实能进去、里面确实没有"才落盘空串；
      // 暂时性的断网 / 未认证保持原值，下次扫描再试
      if (failure.unreachable === 'share') {
        persist(machine, host, '')
      } else if (
        cachedResult &&
        (cachedResult.status === 'missing' || cachedResult.status === 'denied')
      ) {
        // 缓存名已不存在，回退为"未探测"，下次按候选名重猜一遍
        persist(machine, host, null)
      }

      return failure
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
  }
}

export interface AoiResolverOptions {
  /** 机台复合键 → 入口里解析出的目标主机 */
  hosts: Map<string, string>
  /** 第二层读整张扫描图（SaveImages）还是局部裁图（SaveSmallImages） */
  imageKind?: AoiImageKind
}

/**
 * 森标 AOI：每台机器一个 IP，第二层按图片类型选 SaveImages / SaveSmallImages。
 *
 * 这里刻意不做目录读取：`base` 交给执行器的 this.read() 去读，
 * 这样主机不可达会计入断网熔断；同时也避免枚举只有主机的 `\\IP` 根目录
 * （Windows 对它返回 EINVAL，表现和断网一模一样）。
 */
export const createAoiResolver = (
  options: AoiResolverOptions,
): MachineResolver => {
  // 老历史记录没有 imageKind，按整张扫描图处理
  const shareDir = AOI_IMAGE_DIRS[options.imageKind ?? DEFAULT_AOI_IMAGE_KIND]

  return {
    category: 'aoi',
    // \\IP\{SaveImages|SaveSmallImages}\{日期}\{8.5|20.5}\{类型}\x.bmp|.jpg
    shape: {
      shiftDir: (shift) => AOI_SHIFT_DIRS[shift],
      hasSlots: false,
      baseBrokenAt: '共享名',
      // 未认证机台占多数：前缀层只给 5 秒，读不通立即按 auth 跳过，
      // 不再逐层拼接日期/班次后等满自适应超时。
      baseReadTimeoutMs: 5_000,
      baseName: shareDir,
    },
    validate: () =>
      options.hosts.size
        ? null
        : '尚未识别森标 AOI 入口，请先选择并识别入口目录',
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
        base: join(host, shareDir),
        reason: '',
      }
    },
    // 厂区/机台/日期/8.5|20.5/类型/x.bmp|.jpg
    segments: (machine, dir) => {
      const [plant, name] = splitMachine(machine)
      const host = options.hosts.get(machine) ?? ''
      const base = host ? join(host, shareDir) : ''

      return [plant, name, ...(base ? tailOf(base, dir) : [])].filter(Boolean)
    },
  }
}
