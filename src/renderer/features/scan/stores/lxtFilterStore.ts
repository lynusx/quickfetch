import { createPlantFilterStore } from './plantFilterStore'

/**
 * 力禧特页的筛选条件。
 *
 * 与利珀共用同一套结构（见 plantFilterStore.ts），但各持一份实例：
 * 两类的机台、类型命名规则都不一样，共用会出现「在力禧特勾的机台
 * 切到利珀还是同一批」这种串。
 *
 * levels 是利珀专用的等级层，力禧特页不渲染、也不参与路径拼接。
 */
export const useLxtFilterStore = createPlantFilterStore('lxt')
