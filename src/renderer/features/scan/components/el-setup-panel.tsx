import PlantMachinePicker from './plant-machine-picker'
import { elPickableMachines } from './el-machine-model'
import { useElFilterStore } from '../stores/elFilterStore'
import { selectEl, useSettingsStore } from '@/features/settings'

/**
 * EL 的 DC 根目录与机台选择。
 *
 * 结构与入口类页面一致，具体实现在 PlantMachinePicker；这里只负责
 * 把 EL 的 MachineInfo 映射成共享形状，并接上 EL 自己的保存/刷新动作。
 * 成功保存不弹识别 toast（EL 只关心目录是否可用），失败由 error Callout 展示。
 */
const ElSetupPanel = () => {
  const el = useSettingsStore(selectEl)
  const saving = useSettingsStore((state) => state.saving)
  const error = useSettingsStore((state) => state.error)
  const saveRoot = useSettingsStore((state) => state.saveRoot)
  const refresh = useSettingsStore((state) => state.refresh)

  return (
    <PlantMachinePicker
      machines={elPickableMachines(el.machines ?? [])}
      entryRoot={el.entryRoot}
      saving={saving}
      error={error}
      filter={useElFilterStore}
      showShareBadge={false}
      onSetup={async (root) => {
        await saveRoot(root)
        return null
      }}
      onRefresh={async () => {
        await refresh()
        return null
      }}
      labels={{
        rootLabel: 'DC 根目录',
        rootPlaceholder: '\\\\10.108.164.2\\qj-dc-el\\DC',
        rootHint: el.entryRoot
          ? '目录变更后会自动重新识别机台，扫描结果按新目录为准。'
          : '输入或选择 DC 根目录后，会自动识别其中的机台。',
        searchPlaceholder: '按机台名搜索，如 A03',
        pickTitle: '请选择 DC 根目录',
        refreshLabel: '重新识别机台',
        emptyText: 'DC 根目录下没有可用机台，请点刷新重新识别',
        unconfiguredText: '配置根目录后，这里会出现厂区与机台列表',
        recognizingText: '正在识别机台…',
      }}
    />
  )
}

export default ElSetupPanel
