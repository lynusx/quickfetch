import type {
  AoiMachine,
  AppSettings,
  CategoryConfig,
  LxtMachine,
  PlMachine,
} from '../../../shared/ipc'

import { updateAoi, updateLxt, updatePl } from '../settings'
import { discoverAoi, mergeAoiMachines } from './aoi'
import { discoverLxt, mergeLxtMachines } from './lxt'
import { discoverPl, mergePlMachines } from './pl'
import type {
  DiscoveredLink,
  Discovery,
  MergeableMachine,
  MergeResult,
} from './shortcuts'

/**
 * 入口类类别（力禧特 / 利珀 / 森标 AOI）的装配描述表。
 *
 * 识别、合并与配置更新本来就只差这三个函数；setup / refresh / reprobe
 * 之前各写一遍同形分支，加一类要改五处。这里把它们收成数据。
 * EL 不是入口类（直接读 DC 根目录），刻意不在表里。
 */
export interface EntryDescriptor<TMachine extends MergeableMachine> {
  label: string
  discover: (entryRoot: string) => Promise<Discovery>
  merge: (
    previous: TMachine[],
    discovered: DiscoveredLink[],
  ) => MergeResult<TMachine>
  update: (
    mutate: (current: CategoryConfig<TMachine>) => CategoryConfig<TMachine>,
  ) => Promise<AppSettings>
}

export const ENTRY_DESCRIPTORS = {
  lxt: {
    label: '力禧特EL',
    discover: discoverLxt,
    merge: mergeLxtMachines,
    update: updateLxt,
  } satisfies EntryDescriptor<LxtMachine>,
  pl: {
    label: '利珀PL',
    discover: discoverPl,
    merge: mergePlMachines,
    update: updatePl,
  } satisfies EntryDescriptor<PlMachine>,
  aoi: {
    label: '森标 AOI',
    discover: discoverAoi,
    merge: mergeAoiMachines,
    update: updateAoi,
  } satisfies EntryDescriptor<AoiMachine>,
} as const

export type EntryCategory = keyof typeof ENTRY_DESCRIPTORS

export const ENTRY_CATEGORIES = Object.keys(
  ENTRY_DESCRIPTORS,
) as EntryCategory[]
