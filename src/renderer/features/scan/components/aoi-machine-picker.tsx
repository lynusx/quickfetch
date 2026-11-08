import { useMemo } from 'react'

import PlantMachinePicker from './plant-machine-picker'
import type { MachineListFilter } from './plant-machine-picker'
import { useAoiFilterStore } from '../stores/aoiFilterStore'
import { ChoiceRadio } from '@/components/choice-list'
import { Field } from '@/components/field'
import { selectAoi, useSettingsStore } from '@/features/settings'
import {
  AOI_IMAGE_KIND_LABEL,
  AOI_SIDE_LABEL,
  aoiSideOfName,
} from '@shared/ipc'
import type { AoiImageKind, AoiMachine, AoiSide } from '@shared/ipc'

interface AoiMachinePickerProps {
  /** 已识别的机台（含 stale），由页面从 settings 里传进来 */
  machines: AoiMachine[]
  onChanged?: () => void
}

/** 检测面：AOI 专属字段，直接读自己的筛选 store */
const AoiSideField = ({ machines }: { machines: AoiMachine[] }) => {
  const plant = useAoiFilterStore((state) => state.plant)
  const side = useAoiFilterStore((state) => state.side)
  const setSide = useAoiFilterStore((state) => state.setSide)

  // 三档台数按当前厂区统计，和厂区选项的写法一致
  const options = useMemo(() => {
    const inPlant = machines.filter(
      (machine) => !machine.stale && machine.plant === plant,
    )
    const count = (value: AoiSide): number =>
      value === 'all'
        ? inPlant.length
        : inPlant.filter((machine) => aoiSideOfName(machine.name) === value)
            .length

    return (['all', 'front', 'back'] as AoiSide[]).map((value) => ({
      value,
      label: AOI_SIDE_LABEL[value],
      meta: count(value),
    }))
  }, [machines, plant])

  return (
    <Field
      label="检测面"
      hint="只筛机台列表、不改扫描路径；切到某一侧会清掉另一侧已选的机台。"
    >
      <ChoiceRadio
        columns={3}
        value={side}
        onValueChange={(value) => setSide(value as AoiSide)}
        options={options}
      />
    </Field>
  )
}

/** 图片类型：AOI 专属字段，决定第二层读 SaveImages 还是 SaveSmallImages */
const AoiImageKindField = () => {
  const imageKind = useAoiFilterStore((state) => state.imageKind)
  const setImageKind = useAoiFilterStore((state) => state.setImageKind)

  return (
    <Field
      label="图片类型"
      hint="整体是整张扫描图（.bmp），局部是异常区域的裁图（.jpg）；两者是机台上的两个同级目录。"
    >
      <ChoiceRadio
        columns={2}
        value={imageKind}
        onValueChange={(value) => setImageKind(value as AoiImageKind)}
        options={(['whole', 'partial'] as AoiImageKind[]).map((value) => ({
          value,
          label: AOI_IMAGE_KIND_LABEL[value],
        }))}
      />
    </Field>
  )
}

/**
 * 森标 AOI 入口与机台选择。
 *
 * 入口结构与力禧特/利珀完全一致，具体实现放在 PlantMachinePicker 里；
 * 检测面与图片类型是本类专属字段，由这里组合进基座的插槽，
 * 基座不再需要 `side` / `imageKind` 这类可选模式 props。
 */
const AoiMachinePicker = ({ machines, onChanged }: AoiMachinePickerProps) => {
  const aoi = useSettingsStore(selectAoi)
  const saving = useSettingsStore((state) => state.saving)
  const error = useSettingsStore((state) => state.error)
  const setupAoi = useSettingsStore((state) => state.setupAoi)
  const refreshAoi = useSettingsStore((state) => state.refreshAoi)

  const side = useAoiFilterStore((state) => state.side)

  const machineFilter = useMemo<MachineListFilter | undefined>(
    () =>
      side === 'all'
        ? undefined
        : {
            test: (machine) => aoiSideOfName(machine.name) === side,
            emptyText: '当前检测面下没有机台',
          },
    [side],
  )

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
      // 森标 AOI 的第二层按图片类型二选一（SaveImages / SaveSmallImages），
      // 没有共享名可探测，也就没有「未探测」徽标可言
      showShareBadge={false}
      beforeMachineList={<AoiSideField machines={machines} />}
      afterMachineList={<AoiImageKindField />}
      machineFilter={machineFilter}
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
