import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, RefreshCw, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useLxtFilterStore } from '@/stores/lxtFilterStore'
import { selectLxt, useSettingsStore } from '@/stores/settingsStore'
import { plantLabel } from '../../../shared/ipc'
import type { LxtMachine } from '../../../shared/ipc'
import { useToast } from '@/hooks/useToast'

/** 机台名按自然序：7A 排在 10A 之前，跟现场习惯一致 */
const compare = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

interface LxtMachinePickerProps {
  /** 已识别的机台（含 stale），由页面从 settings 里传进来 */
  machines: LxtMachine[]
  onChanged?: () => void
}

/**
 * 力禧特入口与机台选择。
 *
 * 入口是一个装着各个厂区文件夹的根目录，每个文件夹里是一堆 .lnk。
 * 识别只读入口目录，不连机台 —— 入口在办公网、机台在专用内网，
 * 识别阶段去连机台只会让界面卡在超时上。
 */
const LxtMachinePicker = ({ machines, onChanged }: LxtMachinePickerProps) => {
  const { showToast } = useToast()
  const lxt = useSettingsStore(selectLxt)
  const saving = useSettingsStore((state) => state.saving)
  const error = useSettingsStore((state) => state.error)
  const setupLxt = useSettingsStore((state) => state.setupLxt)
  const refreshLxt = useSettingsStore((state) => state.refreshLxt)

  const {
    plant,
    keyword,
    selectedMachines,
    setPlant,
    setKeyword,
    setSelectedMachines,
  } = useLxtFilterStore()

  const [draft, setDraft] = useState('')

  useEffect(() => {
    setDraft(lxt.entryRoot ?? '')
  }, [lxt.entryRoot])

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
    useLxtFilterStore.getState().pruneSelected(active.map((item) => item.key))
  }, [active])

  const announce = (result: Awaited<ReturnType<typeof setupLxt>>) => {
    if (!result) return

    const parts = [`${result.added} 台新增`]
    if (result.removed) parts.push(`${result.removed} 台已从入口移除`)
    if (result.relocated) parts.push(`${result.relocated} 台地址变更`)

    showToast('已识别入口', parts.join('，'), 'success')
    onChanged?.()
  }

  const pickRoot = async () => {
    const picked = await window.electronAPI.pickDirectory({
      title: '请选择力禧特入口目录（其下应有东区、西区等文件夹）',
    })

    if (!picked) return

    setDraft(picked.path)
    announce(await setupLxt(picked.path))
  }

  const handleSave = async () => {
    const value = draft.trim()

    if (!value || value === lxt.entryRoot) return

    announce(await setupLxt(value))
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

  const configured = Boolean(lxt.entryRoot)

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="lxt-root">入口目录</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id="lxt-root"
            value={draft}
            placeholder="\\\\10.108.x.x\\share\\力禧特"
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
        <p className="text-xs text-muted-foreground">
          每个含 .lnk 的子文件夹算一个厂区，机台地址来自快捷方式的目标
        </p>
      </Field>

      {lxt.skipped.length > 0 && (
        <details className="rounded-lg border px-3 py-2 text-xs">
          <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
            <TriangleAlert className="size-3.5" />
            {lxt.skipped.length} 个快捷方式已跳过
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {lxt.skipped.map((item) => (
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
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel className="mb-0">
              机台
              <span className="font-normal text-muted-foreground tabular-nums">
                {selectedMachines.length}/{active.length}
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
                onClick={async () => announce(await refreshLxt())}
              >
                <RefreshCw />
              </Button>
            </div>
          </div>

          {plants.length > 1 && (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={plant}
              onValueChange={(value) => value && setPlant(value)}
              className="w-full"
            >
              {plants.map((name) => (
                <ToggleGroupItem key={name} value={name} className="flex-1">
                  {plantLabel(name)}{' '}
                  {active.filter((item) => item.plant === name).length}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}

          <InputGroup>
            <InputGroupInput
              value={keyword}
              placeholder="搜索机台，如 7 或 LX"
              spellCheck={false}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </InputGroup>

          {visible.length ? (
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              value={selectedMachines}
              onValueChange={setSelectedMachines}
              className="grid max-h-56 w-full grid-cols-3 gap-1.5 overflow-y-auto pr-1"
            >
              {visible.map((machine) => (
                <ToggleGroupItem
                  key={machine.key}
                  value={machine.key}
                  className="h-8 w-full font-mono text-xs"
                  title={`${machine.host}${machine.share ? ` · ${machine.share}` : ''}`}
                >
                  {machine.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : (
            <p className="text-xs text-muted-foreground">
              没有匹配「{keyword}」的机台
            </p>
          )}
        </Field>
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

export default LxtMachinePicker
