import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import {
  Building2,
  Monitor,
  RefreshCw,
  Search,
  TriangleAlert,
} from 'lucide-react'
import {
  Box,
  Callout,
  Code,
  Flex,
  IconButton,
  Spinner,
  Text,
  TextField,
} from '@radix-ui/themes'

import { BulkActions } from '@/components/bulk-actions/bulk-actions'
import { ChoiceList, ChoiceRadio } from '@/components/choice-list'
import { Field } from '@/components/field'
import { useToast } from '@/hooks/useToast'
import type { PlantFilterStore } from '../stores/plantFilterStore'
import type { EntrySetupResult, SkippedLink, Plant } from '@shared/ipc'
import { plantLabel } from '@shared/ipc'

/** 机台名按自然序升序：7A 排在 10A 之前，跟现场习惯一致 */
const compare = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

/** 是否为 LX 类机台（如 A-LXJC-01、LX2）；自动默认选中时排除、排序置后，手动全选不排除 */
const isLxMachine = (name: string): boolean => /lx/i.test(name)

/** 机台排序：普通机台在前、LX 机台置后，两组内部各自按自然数字升序 */
const compareMachineName = (a: string, b: string): number => {
  const lxDiff = Number(isLxMachine(a)) - Number(isLxMachine(b))
  if (lxDiff !== 0) return lxDiff

  return compare(a, b)
}

/** 计算指定厂区下默认选中的机台键（排除 LX，并尊重调用方的额外过滤如 AOI 检测面） */
const defaultSelectedKeys = (
  machines: PickableMachine[],
  targetPlant: Plant,
  machineFilter?: MachineListFilter,
): string[] => {
  const inTarget = machines.filter((item) => item.plant === targetPlant)
  const filtered = machineFilter
    ? inTarget.filter((item) => machineFilter.test(item))
    : inTarget

  return filtered
    .filter((item) => !isLxMachine(item.name))
    .map((item) => item.key)
}

export interface PickableMachine {
  plant: Plant
  name: string
  key: string
  host: string
  /**
   * 第二层目录的探测状态：null 未探测、'' 探过但没有、其余为名字。
   * 力禧特是 el / SaveImages，利珀是 pl-6a 这类标识目录名。
   */
  share: string | null
  stale: boolean
}

/**
 * 机台悬停展示的绝对路径（从主机名到机台固定标识或共享目录）。
 *
 * - EL：host 已拼好 `entryRoot\机台名`，share 为 null
 * - 力禧特 / 利珀：有 share 时拼 `host\share`，未探测或无共享仅展示 host
 * - 森标 AOI：share 恒为 null，仅展示 host
 */
const machinePath = (machine: PickableMachine): string => {
  const base = machine.host.replace(/[\\/]+$/, '')
  if (!base) return ''

  return machine.share ? `${base}\\${machine.share}` : base
}

/**
 * 机台列表的额外过滤与空态文案。
 *
 * 用带 `test` 的函数而不是布尔开关：调用方决定「筛掉哪些机台」，
 * 基座只负责在厂区过滤之后、关键词之前应用，不关心为什么筛。
 */
export interface MachineListFilter {
  test: (machine: PickableMachine) => boolean
  /** 过滤后列表为空时的文案；不传用「没有可用机台」 */
  emptyText?: ReactNode
}

interface PlantMachinePickerProps {
  /** 已识别的机台（含 stale），由页面从 settings 里传进来 */
  machines: PickableMachine[]
  entryRoot: string | null
  skipped?: SkippedLink[]
  saving?: boolean
  error?: string | null
  /** 该页的筛选状态，两类各有自己的实例 */
  filter: PlantFilterStore
  onSetup?: (entryRoot: string) => Promise<EntrySetupResult | null>
  onRefresh: () => Promise<EntrySetupResult | null>
  /** 厂区与机台之间的额外字段（森标 AOI 的检测面） */
  beforeMachineList?: ReactNode
  /** 机台列表之后的额外字段（森标 AOI 的图片类型） */
  afterMachineList?: ReactNode
  /** 机台列表的额外过滤（森标 AOI 的检测面） */
  machineFilter?: MachineListFilter
  /** 只有文案不同，结构与交互完全一致；缺省值保持入口类页面的现有文案 */
  labels: {
    searchPlaceholder: string
    rootPlaceholder?: string
    rootHint?: string
    rootLabel?: string
    pickTitle?: string
    refreshLabel?: string
    emptyText?: string
    unconfiguredText?: string
    /** EL 在输入路径但尚未保存时显示「正在识别」；不传则保持入口类文案 */
    recognizingText?: string
  }
  onChanged?: () => void
}

/**
 * 厂区与机台选择器。
 *
 * 入口目录已上提至页面吸顶标题栏，此处专注于厂区与机台的筛选与多选。
 */
const PlantMachinePicker = ({
  machines,
  entryRoot,
  skipped = [],
  saving = false,
  error = null,
  filter,
  onRefresh,
  beforeMachineList,
  afterMachineList,
  machineFilter,
  labels,
  onChanged,
}: PlantMachinePickerProps) => {
  const { showToast } = useToast()

  const plant = filter((state) => state.plant)
  const keyword = filter((state) => state.keyword)
  const selectedMachines = filter((state) => state.selectedMachines)
  const setPlant = filter((state) => state.setPlant)
  const setKeyword = filter((state) => state.setKeyword)
  const setSelectedMachines = filter((state) => state.setSelectedMachines)

  const active = useMemo(
    () =>
      machines
        .filter((item) => !item.stale)
        .sort((a, b) => compareMachineName(a.name, b.name)),
    [machines],
  )

  // 厂区从机台列表去重后动态生成：以后多一个「三区」只需新建文件夹
  const plants = useMemo(() => {
    const names = [...new Set(active.map((item) => item.plant))]
    return names.sort((a, b) => compare(plantLabel(a), plantLabel(b)))
  }, [active])

  // 当前厂区被删掉或首次进来时，自动落到第一个厂区并默认选中除 LX 外的所有机台
  useEffect(() => {
    if (!plants.length) return
    if (!plants.includes(plant)) {
      const firstPlant = plants[0]
      setPlant(firstPlant)
      setSelectedMachines(
        defaultSelectedKeys(active, firstPlant, machineFilter),
      )
    }
  }, [plants, plant, active, machineFilter, setPlant, setSelectedMachines])

  const handlePlantChange = (nextPlant: Plant) => {
    if (nextPlant === plant) return
    setPlant(nextPlant)
    setSelectedMachines(defaultSelectedKeys(active, nextPlant, machineFilter))
  }

  /** 当前厂区的机台，调用方的额外过滤在这之上做第二次筛选 */
  const inPlant = useMemo(
    () => active.filter((item) => item.plant === plant),
    [active, plant],
  )

  const visible = useMemo(() => {
    const filtered = machineFilter
      ? inPlant.filter((item) => machineFilter.test(item))
      : inPlant
    const key = keyword.trim().toUpperCase()

    return key
      ? filtered.filter((item) => item.name.toUpperCase().includes(key))
      : filtered
  }, [inPlant, keyword, machineFilter])

  // 入口重新识别后，被标成 stale 的机台要从选中里剔掉，否则会一直挂在那里
  useEffect(() => {
    filter.getState().pruneSelected(active.map((item) => item.key))
  }, [active, filter])

  const announce = (result: EntrySetupResult | null) => {
    if (!result) return

    const parts = [`${result.added} 台新增`]
    if (result.removed) parts.push(`${result.removed} 台已从入口移除`)
    if (result.relocated) parts.push(`${result.relocated} 台位置已更新`)

    showToast('机台识别完成', parts.join('，') || '机台列表无变化', 'info')
    onChanged?.()
  }

  const toggleAll = () => {
    const currentKeys = visible.map((m) => m.key)
    const allSelected = currentKeys.every((k) => selectedMachines.includes(k))
    if (allSelected) {
      setSelectedMachines(
        selectedMachines.filter((k) => !currentKeys.includes(k)),
      )
    } else {
      const merged = new Set([...selectedMachines, ...currentKeys])
      setSelectedMachines([...merged])
    }
  }

  const configured = Boolean(entryRoot)

  return (
    <Flex direction="column" gap="4">
      {skipped.length > 0 && (
        <Box asChild p="2">
          <details className="skipped-box">
            <Flex asChild align="center" gap="2">
              <summary>
                <TriangleAlert size={14} strokeWidth={1.75} />
                <Text size="1" color="gray">
                  {skipped.length} 个快捷方式已跳过
                </Text>
              </summary>
            </Flex>
            <Flex direction="column" gap="1" mt="2">
              {skipped.map((item) => (
                <Flex
                  key={`${item.plant}/${item.file}`}
                  align="baseline"
                  gap="2"
                >
                  <Code variant="ghost" size="1" color="gray">
                    {item.plant}/{item.file}
                  </Code>
                  <Text size="1" color="gray">
                    {item.reason}
                  </Text>
                </Flex>
              ))}
            </Flex>
          </details>
        </Box>
      )}

      {error && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {configured && active.length > 0 ? (
        <Flex direction="column" gap="4">
          <Field
            label="厂区"
            icon={<Building2 size={15} strokeWidth={1.75} />}
            count={plant ? plantLabel(plant) : '未选择'}
          >
            <ChoiceRadio
              layout="inline"
              value={plant}
              onValueChange={handlePlantChange}
              options={plants.map((name) => ({
                value: name,
                label: plantLabel(name),
                meta: active.filter((item) => item.plant === name).length,
              }))}
            />
          </Field>

          {beforeMachineList}

          <Field
            label="机台"
            icon={<Monitor size={15} strokeWidth={1.75} />}
            count={`${selectedMachines.length}/${visible.length}`}
            actions={
              <>
                <Box width="200px">
                  <TextField.Root
                    value={keyword}
                    placeholder={labels.searchPlaceholder}
                    spellCheck={false}
                    onChange={(e) => setKeyword(e.target.value)}
                  >
                    <TextField.Slot side="left">
                      <Search size={14} strokeWidth={1.75} />
                    </TextField.Slot>
                  </TextField.Root>
                </Box>
                <BulkActions
                  onToggleAll={toggleAll}
                  allSelected={
                    visible.length > 0 &&
                    visible.every((item) => selectedMachines.includes(item.key))
                  }
                  toggleDisabled={visible.length === 0}
                  selectLabel="全选本区"
                  cancelLabel="清空本区"
                  toggleIcon
                  extra={
                    <IconButton
                      type="button"
                      variant="soft"
                      color="gray"
                      aria-label={labels.refreshLabel ?? '重新识别入口'}
                      disabled={saving}
                      onClick={async () => announce(await onRefresh())}
                      title={labels.refreshLabel ?? '重新识别入口'}
                    >
                      {saving ? (
                        <Spinner size="1" />
                      ) : (
                        <RefreshCw size={14} strokeWidth={1.75} />
                      )}
                    </IconButton>
                  }
                />
              </>
            }
          >
            {visible.length ? (
              <ChoiceList
                layout="inline"
                itemWidth="128px"
                scroll
                scrollMaxHeight="180px"
                value={selectedMachines}
                onValueChange={setSelectedMachines}
                options={visible.map((machine) => {
                  const path = machinePath(machine)

                  return {
                    value: machine.key,
                    label: (
                      <Code
                        variant="ghost"
                        color="gray"
                        highContrast
                        size="2"
                        truncate
                      >
                        {machine.name}
                      </Code>
                    ),
                    tooltip: path || undefined,
                  }
                })}
              />
            ) : (
              <Text size="2" color="gray">
                {keyword.trim()
                  ? `没有匹配「${keyword}」的机台`
                  : (machineFilter?.emptyText ?? '没有可用机台')}
              </Text>
            )}
          </Field>

          {afterMachineList}
        </Flex>
      ) : (
        <Text size="2" color="gray">
          {configured
            ? (labels.emptyText ?? '入口里没有可用机台，请检查快捷方式')
            : (labels.unconfiguredText ??
              '在顶部选择入口目录后，会自动识别各厂区机台')}
        </Text>
      )}
    </Flex>
  )
}

export default PlantMachinePicker
