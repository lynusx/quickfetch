import { useCallback } from 'react'

import type { ScanCategory } from '@shared/ipc'

import { deriveScope, scanScopeOf } from '../scanScope'

interface UsePlantScanPageOptions {
  category: ScanCategory
  configured: boolean
  /** 该类别的类型清单，用于区分「还没添加」与「添加了没勾」 */
  typeCatalog: string[]
}

/**
 * 从筛选 store 取快照，交给 scanScope 派生。
 *
 * 页面因此只剩标题、入口/筛选节点与 picker；ready / missing / signature
 * 与类别差异（时段层、等级、图片类型）都不再散在四个 page module 里。
 */
export const usePlantScanPage = ({
  category,
  configured,
  typeCatalog,
}: UsePlantScanPageOptions) => {
  const scope = scanScopeOf(category)
  // 订阅整份筛选状态：任一字段变化都要重算 ready / missing / signature
  const state = scope.store()

  const derived = deriveScope(category, state, configured, typeCatalog)

  /**
   * 按 store 的**当前**状态重算指纹。
   *
   * 历史恢复会在同一个同步块里改完筛选；渲染时捕获的 derived 还是旧值，
   * 所以恢复流程需要在改完之后再问一次「现在的指纹是什么」。
   */
  const getSignature = useCallback(
    () => scope.signature(configured, typeCatalog),
    [scope, configured, typeCatalog],
  )

  return {
    ...derived,
    getParams: () => derived.params,
    getSignature,
  }
}
