import PlantFilterPanel, {
  FilterDateShift,
  FilterTypes,
} from './plant-filter-panel'
import { usePlantFilterDefaults } from './plant-filter-defaults'
import { useAoiFilterStore } from '../stores/aoiFilterStore'
import { useUserPreferencesStore } from '@/features/settings'

/**
 * 森标 AOI 扫描范围。
 *
 * 与力禧特/利珀共用同一套 section，差别是没有时段层：路径是
 * 日期 → 8.5/20.5 → 类型，界面仍按语义显示白班/夜班。
 */
const AoiFilterPanel = () => {
  const aoiTypes = useUserPreferencesStore((state) => state.aoiTypes)
  const addAoiType = useUserPreferencesStore((state) => state.addAoiType)
  const removeAoiType = useUserPreferencesStore((state) => state.removeAoiType)

  usePlantFilterDefaults(useAoiFilterStore)

  return (
    <PlantFilterPanel>
      <FilterDateShift filter={useAoiFilterStore} index={3} />
      <FilterTypes
        filter={useAoiFilterStore}
        index={4}
        types={aoiTypes}
        onAddType={addAoiType}
        onRemoveType={removeAoiType}
        placeholder="色差"
        example="色差、色斑、大饼片"
      />
    </PlantFilterPanel>
  )
}

export default AoiFilterPanel
