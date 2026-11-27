import type { AoiMachine, LxtMachine, PlMachine } from '../../../shared/ipc'
import { SCAN_CATEGORY_LABEL } from '../../../shared/scanCategories'

import { createShortcutEntry } from './shortcuts'
import type {
  DiscoveredLink,
  MergeableMachine,
  ShortcutEntry,
} from './shortcuts'

/**
 * 快捷方式入口类（力禧特 / 利珀 / 森标 AOI）的统一识别与合并描述表。
 *
 * 三者的目录结构都是「入口根目录 / 厂区 / 机台.lnk」，仅报错提示中的类别名称不同；
 * 不再拆成三份克隆文件，也不反向依赖 settings，方便在配置与任务装配层自由组合。
 */

const createEntryMachine = <TMachine extends MergeableMachine>(
  link: DiscoveredLink,
  key: string,
): TMachine =>
  ({
    plant: link.plant,
    name: link.name,
    key,
    host: link.host,
    share: null,
    stale: false,
  }) as TMachine

export interface ShortcutEntryDescriptor<
  TMachine extends MergeableMachine,
> extends ShortcutEntry<TMachine> {
  label: string
}

export const ENTRY_DESCRIPTORS = {
  lxt: {
    label: SCAN_CATEGORY_LABEL.lxt,
    ...createShortcutEntry<LxtMachine>(
      SCAN_CATEGORY_LABEL.lxt,
      createEntryMachine,
    ),
  } satisfies ShortcutEntryDescriptor<LxtMachine>,
  pl: {
    label: SCAN_CATEGORY_LABEL.pl,
    ...createShortcutEntry<PlMachine>(
      SCAN_CATEGORY_LABEL.pl,
      createEntryMachine,
    ),
  } satisfies ShortcutEntryDescriptor<PlMachine>,
  aoi: {
    label: SCAN_CATEGORY_LABEL.aoi,
    ...createShortcutEntry<AoiMachine>(
      SCAN_CATEGORY_LABEL.aoi,
      createEntryMachine,
    ),
  } satisfies ShortcutEntryDescriptor<AoiMachine>,
} as const

export type EntryCategory = keyof typeof ENTRY_DESCRIPTORS

export const ENTRY_CATEGORIES = [
  'lxt',
  'pl',
  'aoi',
] as const satisfies readonly EntryCategory[]
