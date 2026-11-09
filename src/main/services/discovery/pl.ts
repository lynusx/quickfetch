import type { PlMachine } from '../../../shared/ipc'

import { createShortcutEntry, machineKey } from './shortcuts'

/**
 * 利珀机台识别。
 *
 * 入口结构与力禧特一样（根目录 / 厂区 / 机台.lnk），所以识别复用 shortcuts.ts。
 * 差别在路径的第二层：力禧特是固定的 el / SaveImages，利珀是「机台标识」，
 * 名字不固定（pl-6a、东区pl-10b、pl-03c），只能拿线别名去探测。
 */

export const PL_ENTRY_NAME = '利珀PL'

/** 机台唯一键；历史记录、复制分组都按它走 */
export const plKey = (plant: string, name: string): string =>
  machineKey(plant, name)

const entry = createShortcutEntry<PlMachine>(PL_ENTRY_NAME, (link, key) => ({
  plant: link.plant,
  name: link.name,
  key,
  host: link.host,
  share: null,
  stale: false,
}))

export const discoverPl = entry.discover
export const mergePlMachines = entry.merge
