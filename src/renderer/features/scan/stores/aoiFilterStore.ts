import { createPlantFilterStore } from './plantFilterStore'

/**
 * 森标 AOI 页的筛选条件。
 *
 * 与力禧特、利珀共用同一套结构，但各持一份实例；AOI 的路径没有时段层，
 * 页面不渲染时段选择，slots 始终为空。
 */
export const useAoiFilterStore = createPlantFilterStore('aoi')
