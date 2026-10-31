import { useEffect } from 'react'

import LxtFilterPanel from '@/components/LxtFilterPanel'
import LxtMachinePicker from '@/components/LxtMachinePicker'
import PlantScanPage from '@/components/PlantScanPage'
import { useLxtFilterStore } from '@/stores/lxtFilterStore'
import { selectLxt, useSettingsStore } from '@/stores/settingsStore'
import { useUserPreferencesStore } from '@/stores/userPreferencesStore'

/**
 * 力禧特图片扫描。
 *
 * 与其他「厂区/机台」类扫描共用同一套页面骨架（PlantScanPage），
 * 这里只提供力禧特自己的机台来源与筛选面板。
 */
const LxtScanPage = () => {
  const lxt = useSettingsStore(selectLxt)
  const load = useSettingsStore((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  const date = useLxtFilterStore((state) => state.date)
  const shift = useLxtFilterStore((state) => state.shift)
  const slots = useLxtFilterStore((state) => state.slots)
  const types = useLxtFilterStore((state) => state.types)
  const selectedMachines = useLxtFilterStore((state) => state.selectedMachines)
  const lxtTypes = useUserPreferencesStore((state) => state.lxtTypes)

  const configured = Boolean(lxt.entryRoot)
  const active = lxt.machines.filter((item) => !item.stale)
  const ready =
    configured &&
    selectedMachines.length > 0 &&
    slots.length > 0 &&
    types.length > 0 &&
    Boolean(date)

  // 类型默认是空的，缺它时要说清楚是「还没添加」还是「添加了没勾」
  const missing = configured
    ? [
        selectedMachines.length ? '' : '机台',
        date ? '' : '日期',
        slots.length ? '' : '时段',
        types.length ? '' : lxtTypes.length ? '类型' : '类型（点「编辑」添加）',
      ].filter(Boolean)
    : []

  return (
    <PlantScanPage
      category="lxt"
      title="力禧特图片批量拷贝"
      unconfigured={{
        title: '先配置力禧特入口',
        description:
          '在左侧选择入口目录，应用会解析其中的快捷方式并识别各厂区机台',
      }}
      networkHint="接入力禧特专用内网后点击「继续」，已扫描的结果不会丢失"
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
      })}
      picker={<LxtMachinePicker machines={lxt.machines} />}
      filterPanel={<LxtFilterPanel />}
    />
  )
}

export default LxtScanPage
