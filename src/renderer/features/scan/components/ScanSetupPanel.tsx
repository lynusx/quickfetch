import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, RefreshCw } from 'lucide-react'

import { ChoiceList, ChoiceRadio } from '@/components/ChoiceList'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { useImageFilterStore } from '../stores/imageFilterStore'
import { useSettingsStore } from '@/features/settings'
import type { Plant } from '@shared/ipc'
import { plantLabel } from '@shared/ipc'

/** 机台名按自然序：A02 排在 A01 之后而不是 A10 之后 */
const compare = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

/**
 * 根目录与「厂区 / 机台」选择。
 *
 * 机台列表来自主进程对根目录的一次 readdir，结果持久化在 userData 下，
 * 所以第二次打开应用不需要重新选目录。
 *
 * 厂区与机台是两个平级的类别（跟力禧特、利珀一致）：厂区从机台列表去重后
 * 动态生成，选中哪个厂区只过滤下面的机台列表，不参与路径拼接 ——
 * EL 的机台目录名首字母就决定了归属（A → 东区、B → 西区），
 * 所以两者是同一批数据的不同视角，不该挤在一个 Field 里。
 */
const ScanSetupPanel = () => {
  const { settings, saving, load, saveRoot, refresh } = useSettingsStore()
  const {
    plant,
    keyword,
    selectedMachines,
    setPlant,
    setKeyword,
    setSelectedMachines,
  } = useImageFilterStore()

  const [draft, setDraft] = useState(settings?.rootPath ?? '')
  const [prevRootPath, setPrevRootPath] = useState(settings?.rootPath)

  // 配置加载完成或保存成功后，把磁盘上的路径同步回输入框（纯渲染期状态同步）
  if (settings?.rootPath !== prevRootPath) {
    setPrevRootPath(settings?.rootPath)
    setDraft(settings?.rootPath ?? '')
  }

  useEffect(() => {
    void load()
  }, [load])

  const machines = useMemo(() => settings?.machines ?? [], [settings?.machines])

  // 厂区按机台实际归属去重，排序保证东区在前；以后多一个厂区不用改代码
  const plants = useMemo(() => {
    const names = [...new Set(machines.map((item) => item.plant))]
    return names.sort((a, b) => compare(plantLabel(a), plantLabel(b)))
  }, [machines])

  // 当前厂区没有机台（首次进入或根目录迁移）时，落到第一个有数据的厂区
  useEffect(() => {
    if (!plants.length) return
    if (!plants.includes(plant)) setPlant(plants[0])
  }, [plants, plant, setPlant])

  const visible = useMemo(() => {
    const list = machines.filter((item) => item.plant === plant)
    const key = keyword.trim().toUpperCase()

    return key
      ? list.filter((item) => item.name.toUpperCase().includes(key))
      : list
  }, [machines, plant, keyword])

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

      {configured && machines.length > 0 ? (
        <>
          {/* 厂区：独立的单选类别，与机台平级；选中后只过滤下面的机台列表 */}
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
              onValueChange={(value) => setPlant(value as Plant)}
              options={plants.map((name) => ({
                value: name,
                label: plantLabel(name),
                meta: machines.filter((item) => item.plant === name).length,
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
                  disabled={!visible.length}
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

            <InputGroup>
              <InputGroupInput
                value={keyword}
                placeholder="按机台名搜索，如 A03"
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
                  value: machine.name,
                  label: <span className="font-mono">{machine.name}</span>,
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
            ? 'DC 根目录下没有可用机台，请点刷新重新识别'
            : settings?.rootPath === null && !draft
              ? '输入或选择 DC 根目录后，会自动识别其中的机台'
              : '正在识别机台…'}
        </p>
      )}
    </div>
  )
}

export default ScanSetupPanel
