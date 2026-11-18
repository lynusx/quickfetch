import type { ReactNode } from 'react'

import PlantFilterPanel, {
  FilterDateShift,
  FilterSlots,
  FilterTypes,
} from './plant-filter-panel'
import { usePlantFilterDefaults } from './plant-filter-defaults'
import { useLxtFilterStore } from '../stores/lxtFilterStore'
import { selectLxt, useSettingsStore } from '@/features/settings'

interface LxtFilterPanelProps {
  picker: ReactNode
}

/**
 * 力禧特扫描范围：日期/班次 → 时段 → 厂区/机台 → 类型。
 */
const LxtFilterPanel = ({ picker }: LxtFilterPanelProps) => {
  const lxt = useSettingsStore(selectLxt)
  const addType = useSettingsStore((state) => state.addType)
  const removeType = useSettingsStore((state) => state.removeType)
  const catalogReady = useSettingsStore((state) => state.settings !== null)

  usePlantFilterDefaults(useLxtFilterStore, { slots: true })

  return (
    <PlantFilterPanel>
      <FilterDateShift filter={useLxtFilterStore}>
        <FilterSlots filter={useLxtFilterStore} />
      </FilterDateShift>
      {picker}
      <FilterTypes
        filter={useLxtFilterStore}
        types={lxt.typeCatalog}
        catalogReady={catalogReady}
        onAddType={(type) => void addType('lxt', type)}
        onRemoveType={(type) => void removeType('lxt', type)}
        placeholder="NG_脏污_A-"
        example="NG_脏污_A-"
      />
    </PlantFilterPanel>
  )
}

export default LxtFilterPanel
