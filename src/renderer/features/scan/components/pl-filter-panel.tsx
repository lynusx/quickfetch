import PlantFilterPanel, {
  FilterDateShift,
  FilterLevels,
  FilterSlots,
  FilterTypes,
} from './plant-filter-panel'
import { usePlantFilterDefaults } from './plant-filter-defaults'
import { usePlFilterStore } from '../stores/plFilterStore'
import { selectPl, useSettingsStore } from '@/features/settings'
import { PL_LEVELS } from '@shared/ipc'

/**
 * 利珀扫描范围。
 *
 * 比力禧特多一层「等级」：利珀的路径是
 * 时段 → Fail → 等级(A/B/C) → 类型，所以等级必须先选出来。
 */
const PlFilterPanel = () => {
  const pl = useSettingsStore(selectPl)
  const addType = useSettingsStore((state) => state.addType)
  const removeType = useSettingsStore((state) => state.removeType)
  const catalogReady = useSettingsStore((state) => state.settings !== null)
  const levels = usePlFilterStore((state) => state.levels)

  usePlantFilterDefaults(usePlFilterStore, { slots: true, paddedSlots: true })

  return (
    <PlantFilterPanel>
      <FilterDateShift
        filter={usePlFilterStore}
        index={3}
        extraDone={levels.length > 0}
      >
        <FilterLevels filter={usePlFilterStore} options={PL_LEVELS} />
      </FilterDateShift>
      <FilterSlots filter={usePlFilterStore} index={4} padded />
      <FilterTypes
        filter={usePlFilterStore}
        index={5}
        types={pl.typeCatalog}
        catalogReady={catalogReady}
        onAddType={(type) => void addType('pl', type)}
        onRemoveType={(type) => void removeType('pl', type)}
        placeholder="脏污"
        example="脏污、面划伤"
      />
    </PlantFilterPanel>
  )
}

export default PlFilterPanel
