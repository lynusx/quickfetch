import type { ScanTaskParams } from '@shared/ipc'

/**
 * 扫描页的参数派生：四个类别共用一份 ready / missing / signature / params 规则。
 *
 * 这里不 import React 或任何 store，纯输入输出；页面 hook 只负责从
 * 各自的 filter store 取字段。新增类别时差异只体现在 hasSlots / requiresLevels
 * 与 typeCatalog 上。
 */
export interface ScanParamsInput {
  configured: boolean
  plant: string
  selectedMachines: string[]
  date: string
  shift: '白班' | '夜班'
  slots: string[]
  types: string[]
  levels: string[]
  /** 森标 AOI 没有时段层 */
  hasSlots: boolean
  /** 利珀多一层缺陷等级 */
  requiresLevels: boolean
  /** 该类别的类型清单；为空时提示去「编辑」添加 */
  typeCatalog: string[]
}

export interface ScanParamsResult {
  ready: boolean
  missing: string[]
  filterSignature: string
  params: Omit<ScanTaskParams, 'category'>
}

export const deriveScanParams = (input: ScanParamsInput): ScanParamsResult => {
  const {
    configured,
    plant,
    selectedMachines,
    date,
    shift,
    slots,
    types,
    levels,
    hasSlots,
    requiresLevels,
    typeCatalog,
  } = input

  const ready =
    configured &&
    selectedMachines.length > 0 &&
    (!hasSlots || slots.length > 0) &&
    (!requiresLevels || levels.length > 0) &&
    types.length > 0 &&
    Boolean(date)

  // 类型默认是空的，缺它时要说清楚是「还没添加」还是「添加了没勾」
  const missing = configured
    ? [
        selectedMachines.length ? '' : '机台',
        date ? '' : '日期',
        hasSlots && !slots.length ? '时段' : '',
        requiresLevels && !levels.length ? '等级' : '',
        types.length
          ? ''
          : typeCatalog.length
            ? '类型'
            : '类型（点「编辑」添加）',
      ].filter(Boolean)
    : []

  const filterSignature = [
    plant,
    date,
    shift,
    hasSlots ? slots.join(',') : '',
    requiresLevels ? levels.join(',') : '',
    types.join(','),
    selectedMachines.join(','),
  ].join('|')

  return {
    ready,
    missing,
    filterSignature,
    params: {
      machines: selectedMachines,
      date,
      shift,
      slots: hasSlots ? slots : [],
      types,
      ...(requiresLevels ? { levels } : {}),
    },
  }
}
