import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import {
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  ReloadIcon,
} from '@radix-ui/react-icons'
import {
  Badge,
  Box,
  Callout,
  Code,
  Flex,
  IconButton,
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

/** 机台名按自然序：7A 排在 10A 之前，跟现场习惯一致 */
const compare = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

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
 * 共享探测状态的徽标文案与颜色。
 *
 * 三态必须能一眼分开：以前 share 只有 null 与名字两种，"没探过"和
 * "探过但没有"长得一样，现场根本无法判断该不该点重探。
 */
const shareBadge = (
  share: string | null,
): { label: string; tone: 'muted' | 'ready' | 'missing' } => {
  if (share === null) return { label: '未探测', tone: 'muted' }
  if (share === '') return { label: '无共享', tone: 'missing' }

  return { label: share, tone: 'ready' }
}

/** 三态对应的 Badge 语义色；ready 走主题强调色，不写死 indigo */
const SHARE_TONE_COLOR = {
  muted: 'gray',
  ready: undefined,
  missing: 'red',
} as const

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
  /**
   * 是否显示共享探测徽标；森标 AOI 第二层按图片类型二选一，没有可探测的共享。
   *
   * 保留为布尔而不是 render prop：AOI 的 `share` 恒为 null，与力禧特的
   * 「未探测」无法从数据区分，单个显示开关比让调用方接管行渲染更轻。
   */
  showShareBadge?: boolean
  /** 厂区与机台之间的额外字段（森标 AOI 的检测面） */
  beforeMachineList?: ReactNode
  /** 机台列表之后的额外字段（森标 AOI 的图片类型） */
  afterMachineList?: ReactNode
  /** 机台 actions 行、刷新按钮之后（力禧特/利珀 的重新探测共享） */
  machineListActions?: ReactNode
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
  showShareBadge = true,
  beforeMachineList,
  afterMachineList,
  machineListActions,
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
    () => machines.filter((item) => !item.stale),
    [machines],
  )

  // 厂区从机台列表去重后动态生成：以后多一个「三区」只需新建文件夹
  const plants = useMemo(() => {
    const names = [...new Set(active.map((item) => item.plant))]
    return names.sort((a, b) => compare(plantLabel(a), plantLabel(b)))
  }, [active])

  // 当前厂区被删掉或首次进来时，自动落到第一个厂区
  useEffect(() => {
    if (!plants.length) return
    if (!plants.includes(plant)) setPlant(plants[0])
  }, [plants, plant, setPlant])

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
                <ExclamationTriangleIcon width={14} height={14} />
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
          <Field label="厂区" count={plant ? plantLabel(plant) : '未选择'}>
            <ChoiceRadio
              columns={2}
              value={plant}
              onValueChange={setPlant}
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
            count={`${selectedMachines.length}/${visible.length}`}
            actions={
              <BulkActions
                onClear={() => setSelectedMachines([])}
                clearDisabled={!selectedMachines.length}
                onToggleAll={toggleAll}
                allSelected={visible.every((item) =>
                  selectedMachines.includes(item.key),
                )}
                selectLabel="全选本区"
                cancelLabel="取消本区"
                extra={
                  <>
                    <IconButton
                      type="button"
                      variant="ghost"
                      color="gray"
                      size="1"
                      aria-label={labels.refreshLabel ?? '重新识别入口'}
                      disabled={saving}
                      onClick={async () => announce(await onRefresh())}
                      title={labels.refreshLabel ?? '重新识别入口'}
                    >
                      <ReloadIcon width={13} height={13} />
                    </IconButton>
                    {machineListActions}
                  </>
                }
              />
            }
          >
            <TextField.Root
              value={keyword}
              placeholder={labels.searchPlaceholder}
              spellCheck={false}
              onChange={(e) => setKeyword(e.target.value)}
            >
              <TextField.Slot side="left">
                <MagnifyingGlassIcon width={13} height={13} />
              </TextField.Slot>
            </TextField.Root>

            {visible.length ? (
              <ChoiceList
                columns={2}
                scroll
                value={selectedMachines}
                onValueChange={setSelectedMachines}
                options={visible.map((machine) => {
                  const badge = showShareBadge
                    ? shareBadge(machine.share)
                    : null

                  return {
                    value: machine.key,
                    label: (
                      <Flex align="center" gap="2" minWidth="0" width="100%">
                        <Code
                          variant="ghost"
                          color="gray"
                          highContrast
                          size="2"
                        >
                          {machine.name}
                        </Code>
                        {badge ? (
                          <Box maxWidth="84px" overflow="hidden" ml="auto">
                            <Badge
                              variant="soft"
                              color={SHARE_TONE_COLOR[badge.tone]}
                              data-tone={badge.tone}
                              title={`共享：${badge.label}`}
                            >
                              {badge.label}
                            </Badge>
                          </Box>
                        ) : null}
                      </Flex>
                    ),
                    title: badge
                      ? `${machine.host} · 共享 ${badge.label}`
                      : machine.host,
                  }
                })}
              />
            ) : (
              <Text size="1" color="gray">
                {keyword.trim()
                  ? `没有匹配「${keyword}」的机台`
                  : (machineFilter?.emptyText ?? '没有可用机台')}
              </Text>
            )}
          </Field>

          {afterMachineList}
        </Flex>
      ) : (
        <Text size="1" color="gray">
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
