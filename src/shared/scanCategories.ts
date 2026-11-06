import type { ScanCategory } from './ipc'
import { NETWORK_HINT } from './networkHint'

/**
 * 扫描类别的唯一描述表。
 *
 * 「一个扫描类别是什么」以前散在五张手写 Record、一条四臂 if 链和四份
 * 几乎一样的 page 里；加一类要跳七个模块。这里把能共享的部分收在一处：
 * 文案、路径形态、有没有图片类型、类型清单存在哪个字段。
 *
 * 不能共享的仍留在各自的地方：main 的 resolver 构造、renderer 的 store
 * 实例、页面上的入口/机台选择器。
 */

/** 有稳定顺序：侧边栏、页面装配、穷尽性检查都按它走 */
export const SCAN_CATEGORIES = [
  'el',
  'lxt',
  'pl',
  'aoi',
] as const satisfies readonly ScanCategory[]

/** userPreferencesStore 里每类扫描的类型清单字段 */
export type ScanTypeCatalogKey = 'ngTypes' | 'lxtTypes' | 'plTypes' | 'aoiTypes'

export interface ScanCategoryMeta {
  /** 导航与提示里的名字 */
  label: string
  /** 页面左上角的眉标 */
  eyebrow: string
  /** 断网自动暂停时的 toast：网名统一来自 NETWORK_HINT，这里只补上下文 */
  networkHint: string
  /** 路径里有没有时段层 */
  hasSlots: boolean
  /** 路径里有没有缺陷等级层（利珀） */
  requiresLevels: boolean
  /** 有没有「整体 / 局部」图片类型（森标 AOI） */
  hasImageKind: boolean
  /** 类型清单存在 userPreferencesStore 的哪个字段 */
  typeCatalogKey: ScanTypeCatalogKey
}

export const SCAN_CATEGORY_META = {
  el: {
    label: 'EL',
    eyebrow: '找图 · EL',
    networkHint: `共享盘连接中断，任务已暂停。${NETWORK_HINT}`,
    hasSlots: true,
    requiresLevels: false,
    hasImageKind: false,
    typeCatalogKey: 'ngTypes',
  },
  lxt: {
    label: '力禧特EL',
    eyebrow: '找图 · 力禧特EL',
    networkHint: `连不上力禧特机台，任务已暂停。${NETWORK_HINT}`,
    hasSlots: true,
    requiresLevels: false,
    hasImageKind: false,
    typeCatalogKey: 'lxtTypes',
  },
  pl: {
    label: '利珀PL',
    eyebrow: '找图 · 利珀PL',
    networkHint: `连不上利珀机台，任务已暂停。${NETWORK_HINT}`,
    hasSlots: true,
    requiresLevels: true,
    hasImageKind: false,
    typeCatalogKey: 'plTypes',
  },
  aoi: {
    label: '森标 AOI',
    eyebrow: '找图 · 森标 AOI',
    networkHint: `连不上森标 AOI 机台，任务已暂停。${NETWORK_HINT}`,
    hasSlots: false,
    requiresLevels: false,
    hasImageKind: true,
    typeCatalogKey: 'aoiTypes',
  },
} as const satisfies Record<ScanCategory, ScanCategoryMeta>

export const SCAN_CATEGORY_LABEL = Object.fromEntries(
  SCAN_CATEGORIES.map((category) => [
    category,
    SCAN_CATEGORY_META[category].label,
  ]),
) as Record<ScanCategory, string>
