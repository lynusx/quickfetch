import PlantFilterPanel, {
  FilterDateShift,
  FilterSlots,
  FilterTypes,
} from './plant-filter-panel'
import { usePlantFilterDefaults } from './plant-filter-defaults'
import { useLxtFilterStore } from '../stores/lxtFilterStore'
import { selectLxt, useSettingsStore } from '@/features/settings'

/**
 * 力禧特扫描范围。
 *
 * 与利珀共用同一套 section，力禧特没有等级层；类型清单从配置里取。
 */
const LxtFilterPanel = () => {
  const lxt = useSettingsStore(selectLxt)
  const addType = useSettingsStore((state) => state.addType)
  const removeType = useSettingsStore((state) => state.removeType)
  const catalogReady = useSettingsStore((state) => state.settings !== null)

  usePlantFilterDefaults(useLxtFilterStore, { slots: true })

  return (
    <PlantFilterPanel>
      <FilterDateShift filter={useLxtFilterStore} index={3} />
      <FilterSlots filter={useLxtFilterStore} index={4} />
      <FilterTypes
        filter={useLxtFilterStore}
        index={5}
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
