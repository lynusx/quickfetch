import { useEffect, useRef } from 'react'

import type { PlantFilterStore } from '../stores/plantFilterStore'
import { getShiftInfo } from '@/utils/common'

/**
 * 首次进入页面时的默认范围：日期、班次，以及可选的时段。
 *
 * 必须集中在一处：`FilterDateShift` 的 mount effect 会先写日期，
 * 如果时段播种放在 `FilterSlots` 自己的 effect 里，它后跑时已经看不到
 * 「还没有日期」，就会漏播。
 *
 * 单独放一个 module：筛选面板文件只导出组件，避免 fast refresh 警告。
 */

export const shapeSlot = (list: string[], padded: boolean): string[] =>
  padded ? list.map((item) => item.padStart(2, '0')) : list

export interface PlantFilterDefaultsOptions {
  /** 是否有「时段」这一层；AOI 不传 */
  slots?: boolean
  /** 时段是否补零（利珀） */
  paddedSlots?: boolean
}

export const usePlantFilterDefaults = (
  filter: PlantFilterStore,
  options: PlantFilterDefaultsOptions = {},
): void => {
  const { slots = false, paddedSlots = false } = options
  const seeded = useRef(false)

  useEffect(() => {
    if (seeded.current) return
    seeded.current = true

    const state = filter.getState()

    // 切页面回来保留上次范围，否则会把刚恢复的历史任务当成「改了筛选」清掉
    if (state.date) return

    const { shift, date, times } = getShiftInfo(new Date())

    state.setDate(date)
    state.setShift(shift)
    if (slots) state.setSlots(shapeSlot(times, paddedSlots))
  }, [filter, slots, paddedSlots])
}
