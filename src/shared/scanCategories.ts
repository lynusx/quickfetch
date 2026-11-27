import type { ScanCategory } from './ipc'
import { NETWORK_HINT } from './networkHint'

/**
 * 扫描类别的唯一描述表。
 *
 * 把四类扫描的文案、路径形态、时段格式、检索占位与能力开关集中在一处，
 * 新增或修改类别差异时不再跨页面、表单、选择器与摘要条逐个同步。
 */

/** 有稳定顺序：侧边栏、页面装配、穷尽性检查都按它走 */
export const SCAN_CATEGORIES = [
  'el',
  'lxt',
  'pl',
  'aoi',
] as const satisfies readonly ScanCategory[]

const CATEGORY_SET: ReadonlySet<string> = new Set(SCAN_CATEGORIES)

/**
 * 类别归一化的唯一落点。
 *
 * 老任务与历史 JSON 可能没有 category，或带着已删除的类别；实时任务在建
 * 任务入口补一次，历史记录在读取入口补一次，其它地方不再各自回落 `el`。
 */
export const normalizeScanCategory = (value: unknown): ScanCategory =>
  typeof value === 'string' && CATEGORY_SET.has(value)
    ? (value as ScanCategory)
    : 'el'

export interface ScanCategoryMeta {
  /** 导航与提示里的名字 */
  label: string
  /** 断网自动暂停时的 toast：网名统一来自 NETWORK_HINT，这里只补上下文 */
  networkHint: string
  /** 路径里有没有时段层 */
  hasSlots: boolean
  /** 时段目录是否补零为两位（利珀 08/09） */
  paddedSlots: boolean
  /** 路径里有没有缺陷等级层（利珀） */
  requiresLevels: boolean
  /** 有没有「正检 / 背检」检测面筛选（森标 AOI） */
  hasSideFilter: boolean
  /** 有没有「整体 / 局部」图片类型（森标 AOI） */
  hasImageKind: boolean
  /** 编辑类型弹窗输入框占位 */
  typePlaceholder: string
  /** 空类型提示示例 */
  typeExample: string
  /** 机台搜索输入框占位 */
  searchPlaceholder: string
  /** 机台刷新按钮无障碍名称与悬停提示 */
  refreshLabel: string
  /** 已配置入口但没有可用机台时的空状态提示 */
  emptyMachinesText: string
  /** 未配置入口时的提示 */
  unconfiguredText: string
}

export const SCAN_CATEGORY_META = {
  el: {
    label: 'EL',
    networkHint: `共享盘连接中断，任务已暂停。${NETWORK_HINT}`,
    hasSlots: true,
    paddedSlots: false,
    requiresLevels: false,
    hasSideFilter: false,
    hasImageKind: false,
    typePlaceholder: 'NG_脏污_D',
    typeExample: 'NG_脏污_B',
    searchPlaceholder: '按机台名搜索，如 A03',
    refreshLabel: '重新识别机台',
    emptyMachinesText: 'DC 根目录下没有可用机台，请点刷新重新识别',
    unconfiguredText: '在顶部配置根目录后，这里会出现厂区与机台列表',
  },
  lxt: {
    label: '力禧特EL',
    networkHint: `连不上力禧特机台，任务已暂停。${NETWORK_HINT}`,
    hasSlots: true,
    paddedSlots: false,
    requiresLevels: false,
    hasSideFilter: false,
    hasImageKind: false,
    typePlaceholder: 'NG_脏污_A-',
    typeExample: 'NG_脏污_A-',
    searchPlaceholder: '搜索机台，如 7 或 LX',
    refreshLabel: '重新识别入口并探测共享',
    emptyMachinesText: '入口里没有可用机台，请检查快捷方式',
    unconfiguredText: '在顶部选择入口目录后，会自动识别各厂区机台',
  },
  pl: {
    label: '利珀PL',
    networkHint: `连不上利珀机台，任务已暂停。${NETWORK_HINT}`,
    hasSlots: true,
    paddedSlots: true,
    requiresLevels: true,
    hasSideFilter: false,
    hasImageKind: false,
    typePlaceholder: '脏污',
    typeExample: '脏污、面划伤',
    searchPlaceholder: '搜索机台，如 6 或 LX',
    refreshLabel: '重新识别入口并探测共享',
    emptyMachinesText: '入口里没有可用机台，请检查快捷方式',
    unconfiguredText: '在顶部选择入口目录后，会自动识别各厂区机台',
  },
  aoi: {
    label: '森标 AOI',
    networkHint: `连不上森标 AOI 机台，任务已暂停。${NETWORK_HINT}`,
    hasSlots: false,
    paddedSlots: false,
    requiresLevels: false,
    hasSideFilter: true,
    hasImageKind: true,
    typePlaceholder: '色差',
    typeExample: '色差、色斑、大饼片',
    searchPlaceholder: '搜索机台，如 1A 或 背检',
    refreshLabel: '重新识别入口',
    emptyMachinesText: '入口里没有可用机台，请检查快捷方式',
    unconfiguredText: '在顶部选择入口目录后，会自动识别各厂区机台',
  },
} as const satisfies Record<ScanCategory, ScanCategoryMeta>

export const SCAN_CATEGORY_LABEL = Object.fromEntries(
  SCAN_CATEGORIES.map((category) => [
    category,
    SCAN_CATEGORY_META[category].label,
  ]),
) as Record<ScanCategory, string>
