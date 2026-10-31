import { useEffect } from 'react'

import PlFilterPanel from '../components/PlFilterPanel'
import PlMachinePicker from '../components/PlMachinePicker'
import PlantScanPage from '../components/PlantScanPage'
import { usePlFilterStore } from '../stores/plFilterStore'
import {
  selectPl,
  useSettingsStore,
  useUserPreferencesStore,
} from '@/features/settings'

/**
 * 利珀图片扫描。
 *
 * 与力禧特共用页面骨架与选择器，差别只有路径层级：利珀在日期下多一层
 * 机台名、类型外面还包着 Fail/等级，所以筛选面板多了「等级」。
 */
const PlScanPage = () => {
  const pl = useSettingsStore(selectPl)
  const load = useSettingsStore((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  const date = usePlFilterStore((state) => state.date)
  const shift = usePlFilterStore((state) => state.shift)
  const slots = usePlFilterStore((state) => state.slots)
  const types = usePlFilterStore((state) => state.types)
  const levels = usePlFilterStore((state) => state.levels)
  const selectedMachines = usePlFilterStore((state) => state.selectedMachines)
  const plTypes = useUserPreferencesStore((state) => state.plTypes)

  const configured = Boolean(pl.entryRoot)
  const active = pl.machines.filter((item) => !item.stale)
  const ready =
    configured &&
    selectedMachines.length > 0 &&
    slots.length > 0 &&
    levels.length > 0 &&
    types.length > 0 &&
    Boolean(date)

  // 类型默认是空的，缺它时要说清楚是「还没添加」还是「添加了没勾」
  const missing = configured
    ? [
        selectedMachines.length ? '' : '机台',
        date ? '' : '日期',
        slots.length ? '' : '时段',
        levels.length ? '' : '等级',
        types.length ? '' : plTypes.length ? '类型' : '类型（点「编辑」添加）',
      ].filter(Boolean)
    : []

  return (
    <PlantScanPage
      category="pl"
      title="利珀图片批量拷贝"
      unconfigured={{
        title: '先配置利珀入口',
        description:
          '在左侧选择入口目录，应用会解析其中的快捷方式并识别各厂区机台',
      }}
      networkHint="接入利珀专用内网后点击「继续」，已扫描的结果不会丢失"
      configured={configured}
      activeMachines={active.length}
      ready={ready}
      missing={missing}
      getParams={() => ({
        machines: selectedMachines,
        date,
        shift,
        slots,
        types,
        levels,
      })}
      picker={<PlMachinePicker machines={pl.machines} />}
      filterPanel={<PlFilterPanel />}
    />
  )
}

export default PlScanPage
