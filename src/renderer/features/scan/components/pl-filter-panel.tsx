import PlantFilterPanel from './plant-filter-panel'
import { usePlFilterStore } from '../stores/plFilterStore'
import { useUserPreferencesStore } from '@/features/settings'
import { PL_LEVELS } from '@shared/ipc'

/**
 * 利珀扫描范围。
 *
 * 比力禧特多一层「等级」：利珀的路径是
 * 时段 → Fail → 等级(A/B/C) → 类型，所以等级必须先选出来。
 */
const PlFilterPanel = () => {
  const plTypes = useUserPreferencesStore((state) => state.plTypes)
  const addPlType = useUserPreferencesStore((state) => state.addPlType)
  const removePlType = useUserPreferencesStore((state) => state.removePlType)

  return (
    <PlantFilterPanel
      filter={usePlFilterStore}
      types={plTypes}
      onAddType={addPlType}
      onRemoveType={removePlType}
      levelOptions={PL_LEVELS}
      paddedSlots
      typePlaceholder="脏污"
      typeExample="脏污、面划伤"
    />
  )
}

export default PlFilterPanel
