import PlantFilterPanel, {
  FilterDateShift,
  FilterSlotsField,
  FilterTypes,
} from './plant-filter-panel'
import { usePlantFilterDefaults } from './plant-filter-defaults'
import { useElFilterStore } from '../stores/elFilterStore'
import { selectEl, useSettingsStore } from '@/features/settings'

/**
 * EL 扫描范围。
 *
 * 与入口类页面共用同一套 section；EL 的差异只有「时段并入日期 Step」
 * 和类型清单来自 EL 自己的配置，所以保持 4 步而不是多拆一步。
 */
const ElFilterPanel = () => {
  const el = useSettingsStore(selectEl)
  const addType = useSettingsStore((state) => state.addType)
  const removeType = useSettingsStore((state) => state.removeType)
  const catalogReady = useSettingsStore((state) => state.settings !== null)
  const slots = useElFilterStore((state) => state.slots)

  usePlantFilterDefaults(useElFilterStore, { slots: true })

  return (
    <PlantFilterPanel>
      <FilterDateShift
        filter={useElFilterStore}
        index={3}
        extraDone={slots.length > 0}
      >
        <FilterSlotsField filter={useElFilterStore} />
      </FilterDateShift>
      <FilterTypes
        filter={useElFilterStore}
        index={4}
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
