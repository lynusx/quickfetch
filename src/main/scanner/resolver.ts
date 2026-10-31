import { join } from 'node:path'

import type { LxtShare, ScanCategory } from '../../shared/ipc'

import { LXT_SHARES } from '../../shared/ipc'
import { readDirSafe } from './fsx'

/**
 * 机台 → 绝对路径前缀。
 *
 * 两类扫描的差别只在这一步：EL 是「根目录 / 机台 / EL」，
 * 力禧特是「\\IP / 探测出的共享名 / A-01-B」。之后的日期、班次、
 * 时段、类型四层完全一致，所以后面的探测、并发、分批、暂停恢复都能共用。
 */
export interface ResolveResult {
  ok: boolean
  /** 可用的路径前缀；ok 为 false 时是空串 */
  base: string
  /** 失败原因；ok 为 true 时为空串 */
  reason: string
  /** 断链发生在哪一层，用于界面精确提示 */
  brokenAt?: 'EL' | '共享名'
  /**
   * 网络层面的不可达原因：
   * - network：主机不通，多半是没接专用内网
   * - share：主机通了但这台机器上没有可用的共享名
   * - denied：没有访问权限
   */
  unreachable?: 'network' | 'share' | 'denied'
}

export interface MachineResolver {
  readonly category: ScanCategory
  /** 未配置或配置不完整时给出可读原因，避免扫到一半才发现参数不对 */
  validate: () => string | null
  resolve: (machine: string) => Promise<ResolveResult>
  /**
   * 把类型目录的绝对路径拆成结果里展示的层级。
   *
   * EL 是「机台/EL/日期/班次/时段/类型」，取相对根目录的部分；
   * 力禧特的各机台没有共同根，只能按「厂区/机台/日期/…」拼 ——
   * 复制分组里的「机台」取的是第 0 段，两类的层级长短不一样，
   * 所以交给解析器自己决定，不在复制模块里做特判。
   */
  segments: (machine: string, dir: string) => string[]
}

/** 机台标识里带厂区时拆开，用于生成展示路径 */
const splitMachine = (machine: string): [string, string] => {
  const slash = machine.indexOf('/')

  return slash < 0
    ? ['', machine]
    : [machine.slice(0, slash), machine.slice(slash + 1)]
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
