import type { LxtMachine } from '../../../shared/ipc'

import { createShortcutEntry, machineKey } from './shortcuts'

/**
 * 力禧特机台识别。
 *
 * 入口结构与利珀相同（根目录 / 厂区 / 机台.lnk），识别逻辑在 shortcuts.ts；
 * 这里只保留力禧特自己的那部分：第二层是 el / SaveImages 二选一。
 */

export const LXT_ENTRY_NAME = '力禧特EL'

/** 机台唯一键；历史记录、复制分组都按它走 */
export const lxtKey = (plant: string, name: string): string =>
  machineKey(plant, name)

const entry = createShortcutEntry<LxtMachine>(LXT_ENTRY_NAME, (link, key) => ({
  plant: link.plant,
  name: link.name,
  key,
  host: link.host,
  share: null,
  stale: false,
}))

export const discoverLxt = entry.discover
export const mergeLxtMachines = entry.merge
