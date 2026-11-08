import PlantMachinePicker from './plant-machine-picker'
import { ReprobeSharesButton } from './reprobe-shares-button'
import { useLxtFilterStore } from '../stores/lxtFilterStore'
import { selectLxt, useSettingsStore } from '@/features/settings'
import type { LxtMachine } from '@shared/ipc'

interface LxtMachinePickerProps {
  /** 已识别的机台（含 stale），由页面从 settings 里传进来 */
  machines: LxtMachine[]
  onChanged?: () => void
}

/**
 * 力禧特入口与机台选择。
 *
 * 结构与利珀完全一致，具体实现放在 PlantMachinePicker 里，
 * 这里只负责接上力禧特自己的配置与筛选 store。
 */
const LxtMachinePicker = ({ machines, onChanged }: LxtMachinePickerProps) => {
  const lxt = useSettingsStore(selectLxt)
  const saving = useSettingsStore((state) => state.saving)
  const error = useSettingsStore((state) => state.error)
  const setupLxt = useSettingsStore((state) => state.setupLxt)
  const refreshLxt = useSettingsStore((state) => state.refreshLxt)
  const reprobeShares = useSettingsStore((state) => state.reprobeShares)

  return (
    <PlantMachinePicker
      machines={machines}
      entryRoot={lxt.entryRoot}
      skipped={lxt.skipped}
      saving={saving}
      error={error}
      filter={useLxtFilterStore}
      onSetup={setupLxt}
      onRefresh={refreshLxt}
      machineListActions={
        <ReprobeSharesButton
          saving={saving}
          onReprobe={() => reprobeShares('lxt')}
        />
      }
      labels={{
        rootPlaceholder: '\\\\10.108.x.x\\share\\力禧特',
        rootHint:
          '每个含 .lnk 的子文件夹算一个厂区，机台地址来自快捷方式的目标',
        searchPlaceholder: '搜索机台，如 7 或 LX',
      }}
      onChanged={onChanged}
    />
  )
}

export default LxtMachinePicker
