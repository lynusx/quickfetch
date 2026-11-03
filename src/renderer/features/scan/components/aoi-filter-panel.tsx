import PlantFilterPanel from './plant-filter-panel'
import { useAoiFilterStore } from '../stores/aoiFilterStore'
import { useUserPreferencesStore } from '@/features/settings'

/**
 * 森标 AOI 扫描范围。
 *
 * 与力禧特/利珀共用同一套面板，差别是没有时段层：路径是
 * 日期 → 8.5/20.5 → 类型，界面仍按语义显示白班/夜班。
 */
const AoiFilterPanel = () => {
  const aoiTypes = useUserPreferencesStore((state) => state.aoiTypes)
  const addAoiType = useUserPreferencesStore((state) => state.addAoiType)
  const removeAoiType = useUserPreferencesStore((state) => state.removeAoiType)

  return (
    <PlantFilterPanel
      filter={useAoiFilterStore}
      types={aoiTypes}
      onAddType={addAoiType}
      onRemoveType={removeAoiType}
      hasSlots={false}
      typePlaceholder="色差"
      typeExample="色差、色斑、大饼片"
    />
  )
}

export default AoiFilterPanel
