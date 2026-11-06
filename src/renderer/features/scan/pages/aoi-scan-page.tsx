import { useEffect } from 'react'

import AoiFilterPanel from '../components/aoi-filter-panel'
import AoiMachinePicker from '../components/aoi-machine-picker'
import PlantScanPage from '../components/plant-scan-page'
import { NETWORK_HINT } from '@shared/networkHint'
import { SCAN_CATEGORY_META } from '@shared/scanCategories'
import { usePlantScanPage } from '../hooks/usePlantScanPage'
import { useAoiFilterStore } from '../stores/aoiFilterStore'
import {
  selectAoi,
  useSettingsStore,
  useUserPreferencesStore,
} from '@/features/settings'

/**
 * 森标 AOI 图片扫描。
 *
 * 与其他「厂区/机台」类扫描共用同一套页面骨架（PlantScanPage），
 * 这里只提供 AOI 自己的机台来源与筛选面板。路径没有时段层，
 * 因此 getParams 固定传 slots: []。
 */
const META = SCAN_CATEGORY_META.aoi

const AoiScanPage = () => {
  const aoi = useSettingsStore(selectAoi)
  const load = useSettingsStore((state) => state.load)
  const aoiTypes = useUserPreferencesStore(
    (state) => state[META.typeCatalogKey],
  )

  useEffect(() => {
    void load()
  }, [load])

  const configured = Boolean(aoi.entryRoot)
  const active = aoi.machines.filter((item) => !item.stale)
  const { ready, missing, filterSignature, getParams, getSignature } =
    usePlantScanPage({
      store: useAoiFilterStore,
      configured,
      hasSlots: META.hasSlots,
      requiresLevels: META.requiresLevels,
      typeCatalog: aoiTypes,
      hasImageKind: META.hasImageKind,
    })

  return (
    <PlantScanPage
      category="aoi"
      title="森标 AOI 图片批量拷贝"
      unconfigured={{
        title: '先配置森标 AOI 入口',
        description:
          '在左侧选择入口目录，应用会解析其中的快捷方式并识别各厂区机台',
      }}
      networkHint={`${NETWORK_HINT}；点「继续」即可接着扫，已扫到的结果不会丢`}
      configured={configured}
      activeMachines={active.length}
      ready={ready}
      missing={missing}
      getParams={getParams}
      filterSignature={filterSignature}
      getSignature={getSignature}
      picker={<AoiMachinePicker machines={aoi.machines} />}
      filterPanel={<AoiFilterPanel />}
    />
  )
}

export default AoiScanPage
