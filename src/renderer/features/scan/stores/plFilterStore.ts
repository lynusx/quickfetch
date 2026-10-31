import { createPlantFilterStore } from './plantFilterStore'

/**
 * 利珀页的筛选条件。
 *
 * 与力禧特同一套结构，多一个 levels（缺陷等级 A/B/C）——
 * 利珀的路径里，类型目录外面还包着一层等级目录。
 */
export const usePlFilterStore = createPlantFilterStore('pl')
