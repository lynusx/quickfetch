import { useEffect, useMemo, useState } from 'react'
import {
  ExclamationTriangleIcon,
  FileIcon,
  MagnifyingGlassIcon,
  ReloadIcon,
} from '@radix-ui/react-icons'
import {
  Box,
  Button,
  Callout,
  Flex,
  IconButton,
  Spinner,
  Text,
  TextField,
} from '@radix-ui/themes'

import { ChoiceList, ChoiceRadio } from '@/components/choice-list'
import { Field, Step } from '@/components/field'
import { useToast } from '@/hooks/useToast'
import type { PlantFilterStore } from '../stores/plantFilterStore'
import type { EntrySetupResult, LxtSkippedLink, Plant } from '@shared/ipc'
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

interface PlantMachinePickerProps {
  /** 已识别的机台（含 stale），由页面从 settings 里传进来 */
  machines: PickableMachine[]
  entryRoot: string | null
  skipped?: LxtSkippedLink[]
  saving?: boolean
  error?: string | null
  /** 该页的筛选状态，两类各有自己的实例 */
  filter: PlantFilterStore
  onSetup: (entryRoot: string) => Promise<EntrySetupResult | null>
  onRefresh: () => Promise<EntrySetupResult | null>
  /** 强制重新探测各机台的共享目录；力禧特与利珀各走各的通道 */
  onReprobe: () => Promise<boolean>
  /** 只有文案不同，结构与交互两类完全一致 */
  labels: {
    rootPlaceholder: string
    rootHint: string
    searchPlaceholder: string
  }
  onChanged?: () => void
}

/**
 * 「入口目录 + 厂区 + 机台」选择器。
 *
 * 力禧特与利珀的入口是同一套结构：一个装着各厂区文件夹的根目录，
 * 每个文件夹里是一堆 .lnk。识别只读入口目录，不连机台 ——
 * 入口在办公网、机台在专用内网，识别阶段去连机台只会让界面卡在超时上。
 */
const PlantMachinePicker = ({
  machines,
  entryRoot,
  skipped = [],
  saving = false,
  error = null,
  filter,
  onSetup,
  onRefresh,
  onReprobe,
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

  const [draft, setDraft] = useState(entryRoot ?? '')
  const [prevEntryRoot, setPrevEntryRoot] = useState(entryRoot)
  /** 探测共享进行中：46 台要跑几十秒，按钮必须置灰防连点 */
  const [probing, setProbing] = useState(false)

  // 配置变更或保存成功后，同步输入框
  if (entryRoot !== prevEntryRoot) {
    setPrevEntryRoot(entryRoot)
    setDraft(entryRoot ?? '')
  }

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

  const visible = useMemo(() => {
    const list = active.filter((item) => item.plant === plant)
    const key = keyword.trim().toUpperCase()

    return key
      ? list.filter((item) => item.name.toUpperCase().includes(key))
      : list
  }, [active, plant, keyword])

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

  const pickRoot = async () => {
    const picked = await window.electronAPI.pickDirectory({
      title: '选择快捷方式入口目录',
    })
    if (!picked) return

    setDraft(picked.path)
    announce(await onSetup(picked.path))
  }

  const commitDraft = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === (entryRoot ?? '')) return
    announce(await onSetup(trimmed))
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
    <Flex direction="column" gap="5">
      <Step index={1} done={configured}>
        <Field label="入口目录" hint={labels.rootHint}>
          <TextField.Root
            size="2"
            value={draft}
            placeholder={labels.rootPlaceholder}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitDraft()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitDraft()
            }}
            className="mono"
          >
            <TextField.Slot side="right">
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                disabled={saving}
                onClick={() => void pickRoot()}
                title="浏览目录"
              >
                <FileIcon width={14} height={14} />
              </IconButton>
            </TextField.Slot>
          </TextField.Root>
        </Field>
      </Step>

      {skipped.length > 0 && (
        <details className="skipped-box">
          <summary>
            <ExclamationTriangleIcon width={14} height={14} />
            <Text as="span" size="1">
              {skipped.length} 个快捷方式已跳过
            </Text>
          </summary>
          <Flex className="skipped-list" direction="column" gap="1">
            {skipped.map((item) => (
              <Flex key={`${item.plant}/${item.file}`} align="baseline" gap="2">
                <Text as="span" size="1" className="mono">
                  {item.plant}/{item.file}
                </Text>
                <Text size="1" color="gray">
                  {item.reason}
                </Text>
              </Flex>
            ))}
          </Flex>
        </details>
      )}

      {error && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <Step index={2} done={selectedMachines.length > 0}>
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

            <Field
              label="机台"
              count={`${selectedMachines.length}/${visible.length}`}
              actions={
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    color="gray"
                    size="1"
                    onClick={() => setSelectedMachines([])}
                    disabled={!selectedMachines.length}
                  >
                    清空
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    color="gray"
                    size="1"
                    onClick={toggleAll}
                  >
                    {visible.every((item) =>
                      selectedMachines.includes(item.key),
                    )
                      ? '取消本区'
                      : '全选本区'}
                  </Button>
                  <IconButton
                    type="button"
                    variant="ghost"
                    color="gray"
                    size="1"
                    aria-label="重新识别入口"
                    disabled={saving}
                    onClick={async () => announce(await onRefresh())}
                    title="重新识别"
                  >
                    <ReloadIcon width={13} height={13} />
                  </IconButton>
                  <Button
                    type="button"
                    variant="ghost"
                    color="gray"
                    size="1"
                    disabled={saving || probing}
                    title="重新探测各机台的共享目录，现场换了共享名或当初没连上网时用"
                    onClick={async () => {
                      setProbing(true)
                      try {
                        const ok = await onReprobe()
                        if (ok) {
                          showToast(
                            '共享探测完成',
                            '机台列表尾部的徽标已更新，可以开始扫描',
                            'info',
                          )
                        }
                      } finally {
                        setProbing(false)
                      }
                    }}
                  >
                    {probing ? <Spinner size="1" /> : null}
                    重新探测共享
                  </Button>
                </>
              }
            >
              <TextField.Root
                size="2"
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
                    const badge = shareBadge(machine.share)

                    return {
                      value: machine.key,
                      label: (
                        <Flex align="center" gap="1" className="machine-label">
                          <Text as="span" size="2" className="mono">
                            {machine.name}
                          </Text>
                          <Box
                            as="span"
                            className="share-badge"
                            data-tone={badge.tone}
                            title={`共享：${badge.label}`}
                          >
                            {badge.label}
                          </Box>
                        </Flex>
                      ),
                      title: `${machine.host} · 共享 ${badge.label}`,
                    }
                  })}
                />
              ) : (
                <Text size="1" color="gray">
                  没有匹配「{keyword}」的机台
                </Text>
              )}
            </Field>
          </Flex>
        ) : (
          <Text size="1" color="gray">
            {configured
              ? '入口里没有可用机台，请检查快捷方式'
              : '选择入口目录后会识别其中的机台'}
          </Text>
        )}
      </Step>
    </Flex>
  )
}

export default PlantMachinePicker
