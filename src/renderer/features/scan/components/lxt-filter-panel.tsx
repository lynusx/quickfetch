import PlantFilterPanel, {
  FilterDateShift,
  FilterSlots,
  FilterTypes,
} from './plant-filter-panel'
import { usePlantFilterDefaults } from './plant-filter-defaults'
import { useLxtFilterStore } from '../stores/lxtFilterStore'
import { useUserPreferencesStore } from '@/features/settings'

/**
 * 力禧特扫描范围。
 *
 * 与利珀共用同一套 section，力禧特没有等级层；类型清单用自己的那份。
 */
const LxtFilterPanel = () => {
  const lxtTypes = useUserPreferencesStore((state) => state.lxtTypes)
  const addLxtType = useUserPreferencesStore((state) => state.addLxtType)
  const removeLxtType = useUserPreferencesStore((state) => state.removeLxtType)

  usePlantFilterDefaults(useLxtFilterStore, { slots: true })

  return (
    <PlantFilterPanel>
      <FilterDateShift filter={useLxtFilterStore} index={3} />
      <FilterSlots filter={useLxtFilterStore} index={4} />
      <FilterTypes
        filter={useLxtFilterStore}
        index={5}
        types={lxtTypes}
        onAddType={addLxtType}
        onRemoveType={removeLxtType}
        placeholder="NG_脏污_A-"
        example="NG_脏污_A-"
      />
    </PlantFilterPanel>
  )
}

export default LxtFilterPanel
