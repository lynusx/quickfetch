import PlantMachinePicker from './plant-machine-picker'
import { ReprobeSharesButton } from './reprobe-shares-button'
import { usePlFilterStore } from '../stores/plFilterStore'
import { selectPl, useSettingsStore } from '@/features/settings'
import type { PlMachine } from '@shared/ipc'

interface PlMachinePickerProps {
  /** 已识别的机台（含 stale），由页面从 settings 里传进来 */
  machines: PlMachine[]
  onChanged?: () => void
}

/**
 * 利珀入口与机台选择。
 *
 * 入口结构与力禧特一致（根目录 / 厂区 / 机台.lnk），界面也复用同一个组件，
 * 保证两个页面的操作手感完全一样。
 */
const PlMachinePicker = ({ machines, onChanged }: PlMachinePickerProps) => {
  const pl = useSettingsStore(selectPl)
  const saving = useSettingsStore((state) => state.saving)
  const error = useSettingsStore((state) => state.error)
  const setupPl = useSettingsStore((state) => state.setupPl)
  const refreshPl = useSettingsStore((state) => state.refreshPl)
  const reprobeShares = useSettingsStore((state) => state.reprobeShares)

  return (
    <PlantMachinePicker
      machines={machines}
      entryRoot={pl.entryRoot}
      skipped={pl.skipped}
      saving={saving}
      error={error}
      filter={usePlFilterStore}
      onSetup={setupPl}
      onRefresh={refreshPl}
      machineListActions={
        <ReprobeSharesButton
          saving={saving}
          onReprobe={() => reprobeShares('pl')}
        />
      }
      labels={{
        rootPlaceholder: '\\\\10.108.x.x\\share\\利珀',
        rootHint:
          '每个含 .lnk 的子文件夹算一个厂区，机台地址来自快捷方式的目标',
        searchPlaceholder: '搜索机台，如 6 或 LX',
      }}
      onChanged={onChanged}
    />
  )
}

export default PlMachinePicker
