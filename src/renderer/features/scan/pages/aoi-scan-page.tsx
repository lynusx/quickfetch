import { useEffect } from 'react'

import AoiFilterPanel from '../components/aoi-filter-panel'
import AoiMachinePicker from '../components/aoi-machine-picker'
import PlantScanPage from '../components/plant-scan-page'
import { NETWORK_HINT } from '@shared/networkHint'
import { useAoiFilterStore } from '../stores/aoiFilterStore'
import {
  selectAoi,
  useSettingsStore,
  useUserPreferencesStore,
} from '@/features/settings'

/**
 * 森标 AOI 图片扫描。
 *
 * 与其他「厂区/机台」类扫描共用同一套页面骨架（PlantScanPage），
 * 这里只提供 AOI 自己的机台来源与筛选面板。路径没有时段层，
 * 因此 getParams 固定传 slots: []。
 */
const AoiScanPage = () => {
  const aoi = useSettingsStore(selectAoi)
  const load = useSettingsStore((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  const date = useAoiFilterStore((state) => state.date)
  const shift = useAoiFilterStore((state) => state.shift)
  const types = useAoiFilterStore((state) => state.types)
  const plant = useAoiFilterStore((state) => state.plant)
  const selectedMachines = useAoiFilterStore((state) => state.selectedMachines)
  const aoiTypes = useUserPreferencesStore((state) => state.aoiTypes)

  const configured = Boolean(aoi.entryRoot)
  const active = aoi.machines.filter((item) => !item.stale)
  const ready =
    configured &&
    selectedMachines.length > 0 &&
    types.length > 0 &&
    Boolean(date)

  // 类型默认是空的，缺它时要说清楚是「还没添加」还是「添加了没勾」
  const missing = configured
    ? [
        selectedMachines.length ? '' : '机台',
        date ? '' : '日期',
        types.length ? '' : aoiTypes.length ? '类型' : '类型（点「编辑」添加）',
      ].filter(Boolean)
    : []

  return (
    <PlantScanPage
      category="aoi"
      title="森标 AOI 图片批量拷贝"
      unconfigured={{
        title: '先配置森标 AOI 入口',
        description:
          '在左侧选择入口目录，应用会解析其中的快捷方式并识别各厂区机台',
      }}
      networkHint={`${NETWORK_HINT}；点「继续」即可接着扫，已扫到的结果不会丢`}
      configured={configured}
      activeMachines={active.length}
      ready={ready}
      missing={missing}
      getParams={() => ({
        machines: selectedMachines,
        date,
        shift,
        slots: [],
        types,
      })}
      filterSignature={[
        plant,
        date,
        shift,
        types.join(','),
        selectedMachines.join(','),
      ].join('|')}
      picker={<AoiMachinePicker machines={aoi.machines} />}
      filterPanel={<AoiFilterPanel />}
    />
  )
}

export default AoiScanPage
