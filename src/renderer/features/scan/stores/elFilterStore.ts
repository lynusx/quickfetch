import { elPlantOf } from '@shared/ipc'

import { createPlantFilterStore } from './plantFilterStore'

/**
 * EL 的筛选状态。
 *
 * 与 LXT/PL/AOI 共用同一套 store 工厂，只把「机台名 → 厂区」换成
 * EL 的首字母规则。这样切换厂区清空、跨区过滤、重新识别后 prune
 * 这些行为不再有两份实现。
 */
export const useElFilterStore = createPlantFilterStore('el', {
  plantOf: (name) => elPlantOf(name) ?? '',
})
