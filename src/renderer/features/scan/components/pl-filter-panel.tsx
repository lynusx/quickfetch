import type { ReactNode } from 'react'

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

interface PlFilterPanelProps {
  picker: ReactNode
}

/**
 * 利珀扫描范围：日期/班次 → 时段 → 厂区/机台 → 等级 → 类型。
 */
const PlFilterPanel = ({ picker }: PlFilterPanelProps) => {
  const pl = useSettingsStore(selectPl)
  const addType = useSettingsStore((state) => state.addType)
  const removeType = useSettingsStore((state) => state.removeType)
  const catalogReady = useSettingsStore((state) => state.settings !== null)

  usePlantFilterDefaults(usePlFilterStore, { slots: true, paddedSlots: true })

  return (
    <PlantFilterPanel>
      <FilterDateShift filter={usePlFilterStore}>
        <FilterSlots filter={usePlFilterStore} padded />
      </FilterDateShift>
      {picker}
      <FilterLevels filter={usePlFilterStore} options={PL_LEVELS} />
      <FilterTypes
        filter={usePlFilterStore}
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
