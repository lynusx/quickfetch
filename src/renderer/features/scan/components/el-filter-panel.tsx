import type { ReactNode } from 'react'

import PlantFilterPanel, {
  FilterDateShift,
  FilterSlotsField,
  FilterTypes,
} from './plant-filter-panel'
import { usePlantFilterDefaults } from './plant-filter-defaults'
import { useElFilterStore } from '../stores/elFilterStore'
import { selectEl, useSettingsStore } from '@/features/settings'

interface ElFilterPanelProps {
  picker: ReactNode
}

/**
 * EL 扫描范围：日期/班次 → 时段 → 厂区/机台 → 类型。
 */
const ElFilterPanel = ({ picker }: ElFilterPanelProps) => {
  const el = useSettingsStore(selectEl)
  const addType = useSettingsStore((state) => state.addType)
  const removeType = useSettingsStore((state) => state.removeType)
  const catalogReady = useSettingsStore((state) => state.settings !== null)

  usePlantFilterDefaults(useElFilterStore, { slots: true })

  return (
    <PlantFilterPanel>
      <FilterDateShift filter={useElFilterStore}>
        <FilterSlotsField filter={useElFilterStore} />
      </FilterDateShift>
      {picker}
      <FilterTypes
        filter={useElFilterStore}
        types={el.typeCatalog}
        catalogReady={catalogReady}
        onAddType={(type) => void addType('el', type)}
        onRemoveType={(type) => void removeType('el', type)}
        placeholder="NG_脏污_D"
        example="NG_脏污_B"
      />
    </PlantFilterPanel>
  )
}

export default ElFilterPanel
