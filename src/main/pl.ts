import type { PlMachine, PlSettings } from '../shared/ipc'

import { discoverShortcutEntry, machineKey, mergeDiscovered } from './shortcuts'
import type { DiscoveredLink, Discovery, MergeResult } from './shortcuts'

/**
 * 利珀机台识别。
 *
 * 入口结构与力禧特一样（根目录 / 厂区 / 机台.lnk），所以识别复用 shortcuts.ts。
 * 差别在路径的第二层：力禧特是固定的 el / SaveImages，利珀是「机台标识」，
 * 名字不固定（pl-6a、东区pl-10b、pl-03c），只能拿线别名去探测。
 */

export const PL_ENTRY_NAME = '利珀'

/** 机台唯一键；历史记录、复制分组都按它走 */
export const plKey = (plant: string, name: string): string =>
  machineKey(plant, name)

export const defaultPlSettings = (): PlSettings => ({
  entryRoot: null,
  machines: [],
  skipped: [],
  updatedAt: null,
})

export const discoverPl = (entryRoot: string): Promise<Discovery> =>
  discoverShortcutEntry(entryRoot, PL_ENTRY_NAME)

export const mergePlMachines = (
  previous: PlMachine[],
  discovered: DiscoveredLink[],
): MergeResult<PlMachine> =>
  mergeDiscovered<PlMachine>(previous, discovered, (link, key) => ({
    plant: link.plant,
    name: link.name,
    key,
    host: link.host,
    share: null,
    stale: false,
  }))

/**
 * 线别名 → 名字里的匹配形态。
 *
 * 现场命名只有两个共同点：带 pl 前缀、带线别名，例如
 *   6A  → pl-6a
 *   10B → 东区pl-10b
 *   3C  → pl-03c   （线别名 3C 出现在 03c 里，个位数补了 0）
 * 所以别名两侧都允许补一个 0，并且要求两侧是边界（不是数字/字母）。
 *
 * 边界很关键：早先按「包含别名」匹配，9A 会把 pl-19a 当成自己 ——
 * 同一台机器上恰好有 19A 的目录时，探测就会缓存错目录，
 * 之后每次扫描都停在「路径不存在」。
 */
const aliasPattern = (name: string): RegExp => {
  const trimmed = name.trim().toLowerCase()

  if (!trimmed) return /$^/

  // 补零只对第二段有意义（3C → 03c），第一段补零没见过，不放开
  const padded = trimmed.length > 1 ? `0?${trimmed}` : trimmed

  // 别名两侧遇到数字或字母都算别的机器，例如 16a、a6a
  return new RegExp(`(^|[^0-9a-z])${padded}(?![0-9a-z])`, 'i')
}

/**
 * 从主机根目录里的候选名挑出这台机器的标识目录。
 *
 * 先按边界规则筛出候选，再优先 pl 前缀、其次名字最短的 ——
 * 名字越短越可能是专门给这台机器建的那个目录。
 */
export const pickPlShare = (
  dirs: string[],
  machineName: string,
): string | null => {
  if (!machineName.trim()) return null

  const pattern = aliasPattern(machineName)
  const candidates = dirs.filter((dir) => pattern.test(dir))

  if (!candidates.length) return null

  const hasPrefix = (dir: string): boolean => /^pl[-_ ]?/i.test(dir)

  candidates.sort((a, b) => {
    if (hasPrefix(a) !== hasPrefix(b)) return hasPrefix(a) ? -1 : 1
    if (a.length !== b.length) return a.length - b.length
    return a.localeCompare(b, 'zh-CN', { numeric: true })
  })

  return candidates[0]
}
