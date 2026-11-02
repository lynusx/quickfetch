import PlantFilterPanel from './plant-filter-panel'
import { useLxtFilterStore } from '../stores/lxtFilterStore'
import { useUserPreferencesStore } from '@/features/settings'

/**
 * 力禧特扫描范围。
 *
 * 与利珀共用同一套面板（PlantFilterPanel），力禧特没有等级层，因此不传
 * levelOptions；类型清单用自己的那份。
 */
const LxtFilterPanel = () => {
  const lxtTypes = useUserPreferencesStore((state) => state.lxtTypes)
  const addLxtType = useUserPreferencesStore((state) => state.addLxtType)
  const removeLxtType = useUserPreferencesStore((state) => state.removeLxtType)

  return (
    <PlantFilterPanel
      filter={useLxtFilterStore}
      types={lxtTypes}
      onAddType={addLxtType}
      onRemoveType={removeLxtType}
      typePlaceholder="NG_脏污_A-"
      typeExample="NG_脏污_A-"
    />
  )
}

export default LxtFilterPanel
