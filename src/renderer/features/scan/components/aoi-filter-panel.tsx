import PlantFilterPanel, {
  FilterDateShift,
  FilterTypes,
} from './plant-filter-panel'
import { usePlantFilterDefaults } from './plant-filter-defaults'
import { useAoiFilterStore } from '../stores/aoiFilterStore'
import { selectAoi, useSettingsStore } from '@/features/settings'

/**
 * 森标 AOI 扫描范围。
 *
 * 与力禧特/利珀共用同一套 section，差别是没有时段层：路径是
 * 日期 → 8.5/20.5 → 类型，界面仍按语义显示白班/夜班。
 */
const AoiFilterPanel = () => {
  const aoi = useSettingsStore(selectAoi)
  const addType = useSettingsStore((state) => state.addType)
  const removeType = useSettingsStore((state) => state.removeType)
  const catalogReady = useSettingsStore((state) => state.settings !== null)

  usePlantFilterDefaults(useAoiFilterStore)

  return (
    <PlantFilterPanel>
      <FilterDateShift filter={useAoiFilterStore} index={3} />
      <FilterTypes
        filter={useAoiFilterStore}
        index={4}
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
