import PlantMachinePicker from './plant-machine-picker'
import { useAoiFilterStore } from '../stores/aoiFilterStore'
import { selectAoi, useSettingsStore } from '@/features/settings'
import type { AoiMachine } from '@shared/ipc'

interface AoiMachinePickerProps {
  /** 已识别的机台（含 stale），由页面从 settings 里传进来 */
  machines: AoiMachine[]
  onChanged?: () => void
}

/**
 * 森标 AOI 入口与机台选择。
 *
 * 入口结构与力禧特/利珀完全一致，具体实现放在 PlantMachinePicker 里，
 * 这里只接上 AOI 自己的配置与筛选 store。
 */
const AoiMachinePicker = ({ machines, onChanged }: AoiMachinePickerProps) => {
  const aoi = useSettingsStore(selectAoi)
  const saving = useSettingsStore((state) => state.saving)
  const error = useSettingsStore((state) => state.error)
  const setupAoi = useSettingsStore((state) => state.setupAoi)
  const refreshAoi = useSettingsStore((state) => state.refreshAoi)

  return (
    <PlantMachinePicker
      machines={machines}
      entryRoot={aoi.entryRoot}
      skipped={aoi.skipped}
      saving={saving}
      error={error}
      filter={useAoiFilterStore}
      onSetup={setupAoi}
      onRefresh={refreshAoi}
      labels={{
        rootPlaceholder: '\\\\10.108.x.x\\share\\森标-在线AOI',
        rootHint:
          '每个含 .lnk 的子文件夹算一个厂区（东区/西区），机台地址来自快捷方式的目标',
        searchPlaceholder: '搜索机台，如 1A 或 背检',
      }}
      onChanged={onChanged}
    />
  )
}

export default AoiMachinePicker
