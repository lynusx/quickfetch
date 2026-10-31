import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, RefreshCw, TriangleAlert } from 'lucide-react'

import { ChoiceList, ChoiceRadio } from '@/components/ChoiceList'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { useToast } from '@/hooks/useToast'
import type { PlantFilterStore } from '../stores/plantFilterStore'
import type { EntrySetupResult, LxtSkippedLink, Plant } from '@shared/ipc'
import { plantLabel } from '@shared/ipc'

/** 机台名按自然序：7A 排在 10A 之前，跟现场习惯一致 */
const compare = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

/** 只用到这几项，力禧特的 LxtMachine 与利珀的 PlMachine 都满足 */
export interface PickableMachine {
  plant: Plant
  name: string
  key: string
  host: string
  /** 第二层目录的探测缓存；力禧特是 el / SaveImages，利珀是标识目录名 */
  share: unknown
  stale: boolean
}

interface PlantMachinePickerProps {
  /** 已识别的机台（含 stale），由页面从 settings 里传进来 */
  machines: PickableMachine[]
  entryRoot: string | null
  skipped: LxtSkippedLink[]
  saving: boolean
  error: string | null
  /** 该页的筛选状态，两类各有自己的实例 */
  filter: PlantFilterStore
  onSetup: (entryRoot: string) => Promise<EntrySetupResult | null>
  onRefresh: () => Promise<EntrySetupResult | null>
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
  skipped,
  saving,
  error,
  filter,
  onSetup,
  onRefresh,
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
    if (result.relocated) parts.push(`${result.relocated} 台地址变更`)

    showToast('已识别入口', parts.join('，'), 'success')
    onChanged?.()
  }

  const pickRoot = async () => {
    const picked = await window.electronAPI.pickDirectory({
      title: '请选择入口目录（其下应有东区、西区等文件夹）',
    })

    if (!picked) return

    setDraft(picked.path)
    announce(await onSetup(picked.path))
  }

  const handleSave = async () => {
    const value = draft.trim()

    if (!value || value === entryRoot) return

    announce(await onSetup(value))
  }

  const toggleAll = () => {
    const keys = visible.map((item) => item.key)
    const allSelected = keys.every((key) => selectedMachines.includes(key))

    setSelectedMachines(
      allSelected
        ? selectedMachines.filter((key) => !keys.includes(key))
        : [...new Set([...selectedMachines, ...keys])],
    )
  }

  const configured = Boolean(entryRoot)

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="plant-root">入口目录</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id="plant-root"
            value={draft}
            placeholder={labels.rootPlaceholder}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSave()
            }}
            onBlur={() => void handleSave()}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="选择入口目录"
              disabled={saving}
              onClick={() => void pickRoot()}
            >
              <FolderOpen />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <p className="text-xs text-muted-foreground">{labels.rootHint}</p>
      </Field>

      {skipped.length > 0 && (
        <details className="rounded-lg border px-3 py-2 text-xs">
          <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
            <TriangleAlert className="size-3.5" />
            {skipped.length} 个快捷方式已跳过
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {skipped.map((item) => (
              <li key={`${item.plant}/${item.file}`} className="font-mono">
                {item.plant}/{item.file}
                <span className="ml-2 font-sans text-muted-foreground">
                  {item.reason}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {configured && active.length > 0 ? (
        <>
          {/* 厂区：独立的单选类别，与机台平级；选中厂区联动过滤下面的机台列表 */}
          <Field>
            <FieldLabel>
              厂区
              <span className="font-normal text-muted-foreground tabular-nums">
                {plant ? plantLabel(plant) : '未选择'}
              </span>
            </FieldLabel>
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

          {/* 机台：与厂区联动的多选列表，只显示当前厂区的机台 */}
          <Field>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel className="mb-0">
                机台
                <span className="font-normal text-muted-foreground tabular-nums">
                  {selectedMachines.length}/{visible.length}
                </span>
              </FieldLabel>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setSelectedMachines([])}
                  disabled={!selectedMachines.length}
                >
                  清空
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={toggleAll}
                >
                  {visible.every((item) => selectedMachines.includes(item.key))
                    ? '取消本区'
                    : '全选本区'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="重新识别入口"
                  disabled={saving}
                  onClick={async () => announce(await onRefresh())}
                >
                  <RefreshCw />
                </Button>
              </div>
            </div>

            <InputGroup>
              <InputGroupInput
                value={keyword}
                placeholder={labels.searchPlaceholder}
                spellCheck={false}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </InputGroup>

            {visible.length ? (
              <ChoiceList
                columns={2}
                scroll
                value={selectedMachines}
                onValueChange={setSelectedMachines}
                options={visible.map((machine) => ({
                  value: machine.key,
                  label: <span className="font-mono">{machine.name}</span>,
                  title: `${machine.host}${
                    machine.share ? ` · ${String(machine.share)}` : ''
                  }`,
                }))}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                没有匹配「{keyword}」的机台
              </p>
            )}
          </Field>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {configured
            ? '入口里没有可用机台，请检查快捷方式'
            : '选择入口目录后会识别其中的机台'}
        </p>
      )}
    </div>
  )
}

export default PlantMachinePicker
