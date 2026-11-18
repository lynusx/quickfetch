import type { ReactNode } from 'react'

import PlantFilterPanel, {
  FilterDateShift,
  FilterTypes,
} from './plant-filter-panel'
import { usePlantFilterDefaults } from './plant-filter-defaults'
import { useAoiFilterStore } from '../stores/aoiFilterStore'
import { selectAoi, useSettingsStore } from '@/features/settings'

interface AoiFilterPanelProps {
  picker: ReactNode
}

/**
 * 森标 AOI 扫描范围：日期/班次 → 厂区/检测面/机台/图片类型 → 类型。
 */
const AoiFilterPanel = ({ picker }: AoiFilterPanelProps) => {
  const aoi = useSettingsStore(selectAoi)
  const addType = useSettingsStore((state) => state.addType)
  const removeType = useSettingsStore((state) => state.removeType)
  const catalogReady = useSettingsStore((state) => state.settings !== null)

  usePlantFilterDefaults(useAoiFilterStore)

  return (
    <PlantFilterPanel>
      <FilterDateShift filter={useAoiFilterStore} />
      {picker}
      <FilterTypes
        filter={useAoiFilterStore}
        types={aoi.typeCatalog}
        catalogReady={catalogReady}
        onAddType={(type) => void addType('aoi', type)}
        onRemoveType={(type) => void removeType('aoi', type)}
        placeholder="色差"
        example="色差、色斑、大饼片"
      />
    </PlantFilterPanel>
  )
}

export default AoiFilterPanel
