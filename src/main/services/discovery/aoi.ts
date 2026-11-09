import type { AoiMachine } from '../../../shared/ipc'

import { createShortcutEntry, machineKey } from './shortcuts'

/**
 * 森标 AOI 机台识别。
 *
 * 入口结构与力禧特、利珀相同（根目录 / 厂区 / 机台.lnk），识别逻辑在
 * shortcuts.ts。差别在路径的第二层按图片类型二选一（SaveImages /
 * SaveSmallImages），没有需要探测的共享名，所以这里不保留任何探测缓存。
 */

export const AOI_ENTRY_NAME = '森标 AOI'

/** 机台唯一键；历史记录、复制分组都按它走 */
export const aoiKey = (plant: string, name: string): string =>
  machineKey(plant, name)

const entry = createShortcutEntry<AoiMachine>(AOI_ENTRY_NAME, (link, key) => ({
  plant: link.plant,
  name: link.name,
  key,
  host: link.host,
  share: null,
  stale: false,
}))

export const discoverAoi = entry.discover
export const mergeAoiMachines = entry.merge
