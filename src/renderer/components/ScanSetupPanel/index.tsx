import { useEffect, useState } from 'react'
import { FolderOpen, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useImageFilterStore } from '@/stores/imageFilterStore'
import { useSettingsStore } from '@/stores/settingsStore'

/**
 * 根目录与机台选择。
 *
 * 机台列表来自主进程对根目录的一次 readdir，结果持久化在 userData 下，
 * 所以第二次打开应用不需要重新选目录。
 */
const ScanSetupPanel = () => {
  const { settings, saving, load, saveRoot, refresh } = useSettingsStore()
  const { plant, selectedMachines, setPlant, setSelectedMachines } =
    useImageFilterStore()

  const [draft, setDraft] = useState('')

  useEffect(() => {
    void load()
  }, [load])

  // 配置加载完成或保存成功后，把磁盘上的路径同步回输入框
  useEffect(() => {
    setDraft(settings?.rootPath ?? '')
  }, [settings?.rootPath])

  const machines = settings?.machines ?? []
  const east = machines.filter((item) => item.plant === 'east')
  const west = machines.filter((item) => item.plant === 'west')
  const visible = plant === 'east' ? east : west
  const configured = Boolean(settings?.rootPath)

  const pickRoot = async () => {
    const picked = await window.electronAPI.pickDirectory({
      title: '请选择 DC 根目录',
    })

    if (!picked) return

    setDraft(picked.path)
    await saveRoot(picked.path)
  }

  const handleSave = async () => {
    if (!draft.trim() || draft.trim() === settings?.rootPath) return
    await saveRoot(draft.trim())
  }

  const toggleAll = () => {
    const names = visible.map((item) => item.name)
    const allSelected = names.every((name) => selectedMachines.includes(name))

    setSelectedMachines(
      allSelected
        ? selectedMachines.filter((name) => !names.includes(name))
        : [...new Set([...selectedMachines, ...names])],
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="dc-root">DC 根目录</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id="dc-root"
            value={draft}
            placeholder="\\10.108.164.2\qj-dc-el\DC"
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
              aria-label="选择目录"
              disabled={saving}
              onClick={() => void pickRoot()}
            >
              <FolderOpen />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>

      {configured ? (
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel className="mb-0">
              机台
              <span className="font-normal text-muted-foreground tabular-nums">
                {selectedMachines.length}/{machines.length}
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
                {visible.every((item) => selectedMachines.includes(item.name))
                  ? '取消本区'
                  : '全选本区'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="重新识别机台"
                disabled={saving}
                onClick={() => void refresh()}
              >
                <RefreshCw />
              </Button>
            </div>
          </div>

          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={plant}
            onValueChange={(value) =>
              value && setPlant(value as 'east' | 'west')
            }
            className="w-full"
          >
            <ToggleGroupItem value="east" className="flex-1">
              东区 {east.length}
            </ToggleGroupItem>
            <ToggleGroupItem value="west" className="flex-1">
              西区 {west.length}
            </ToggleGroupItem>
          </ToggleGroup>

          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            value={selectedMachines}
            onValueChange={(value) => setSelectedMachines(value)}
            className="grid max-h-56 w-full grid-cols-3 gap-1.5 overflow-y-auto pr-1"
          >
            {visible.map((machine) => (
              <ToggleGroupItem
                key={machine.name}
                value={machine.name}
                className="h-8 w-full font-mono text-xs"
              >
                {machine.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      ) : (
        <p className="text-xs text-muted-foreground">
          {settings?.rootPath === null && !draft
            ? '输入或选择 DC 根目录后，会自动识别其中的机台'
            : '正在识别机台…'}
        </p>
      )}
    </div>
  )
}

export default ScanSetupPanel
