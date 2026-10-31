import type { LxtMachine, LxtSettings } from '../../../shared/ipc'

import { discoverShortcutEntry, machineKey, mergeDiscovered } from './shortcuts'
import type { DiscoveredLink, Discovery, MergeResult } from './shortcuts'

/**
 * 力禧特机台识别。
 *
 * 入口结构与利珀相同（根目录 / 厂区 / 机台.lnk），识别逻辑在 shortcuts.ts；
 * 这里只保留力禧特自己的那部分：第二层是 el / SaveImages 二选一。
 */

export const LXT_ENTRY_NAME = '力禧特'

/** 机台唯一键；历史记录、复制分组都按它走 */
export const lxtKey = (plant: string, name: string): string =>
  machineKey(plant, name)

export const defaultLxtSettings = (): LxtSettings => ({
  entryRoot: null,
  machines: [],
  skipped: [],
  updatedAt: null,
})

export const discoverLxt = (entryRoot: string): Promise<Discovery> =>
  discoverShortcutEntry(entryRoot, LXT_ENTRY_NAME)

export const mergeLxtMachines = (
  previous: LxtMachine[],
  discovered: DiscoveredLink[],
): MergeResult<LxtMachine> =>
  mergeDiscovered<LxtMachine>(previous, discovered, (link, key) => ({
    plant: link.plant,
    name: link.name,
    key,
    host: link.host,
    share: null,
    stale: false,
  }))
