import { useEffect, useMemo, useState } from 'react'
import {
  FileIcon,
  MagnifyingGlassIcon,
  ReloadIcon,
} from '@radix-ui/react-icons'
import { Button, Flex, IconButton, Text, TextField } from '@radix-ui/themes'

import { ChoiceList, ChoiceRadio } from '@/components/ChoiceList'
import { Field, Step } from '@/components/Field'
import { useImageFilterStore } from '../stores/imageFilterStore'
import { useSettingsStore } from '@/features/settings'
import type { Plant } from '@shared/ipc'
import { plantLabel } from '@shared/ipc'

/** 机台名按自然序：A02 排在 A01 之后而不是 A10 之后 */
const compare = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

const ElSetupPanel = () => {
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

  if (settings?.rootPath !== prevRootPath) {
    setPrevRootPath(settings?.rootPath)
    setDraft(settings?.rootPath ?? '')
  }

  useEffect(() => {
    void load()
  }, [load])

  const machines = useMemo(() => settings?.machines ?? [], [settings?.machines])

  const plants = useMemo(() => {
    const names = [...new Set(machines.map((item) => item.plant))]
    return names.sort((a, b) => compare(plantLabel(a), plantLabel(b)))
  }, [machines])

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
    <Flex direction="column" gap="5">
      <Step index={1} done={configured}>
        <Field
          label="DC 根目录"
          hint={
            configured
              ? '目录变更后会自动重新识别机台，扫描结果按新目录为准。'
              : '输入或选择 DC 根目录后，会自动识别其中的机台。'
          }
        >
          <TextField.Root
            size="2"
            value={draft}
            placeholder="\\10.108.164.2\qj-dc-el\DC"
            spellCheck={false}
            className="mono"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSave()
            }}
            onBlur={() => void handleSave()}
          >
            <TextField.Slot side="right">
              <IconButton
                size="1"
                variant="ghost"
                aria-label="选择目录"
                disabled={saving}
                onClick={() => void pickRoot()}
              >
                <FileIcon width={14} height={14} />
              </IconButton>
            </TextField.Slot>
          </TextField.Root>
        </Field>
      </Step>

      <Step index={2} done={selectedMachines.length > 0}>
        {configured && machines.length > 0 ? (
          <Flex direction="column" gap="4">
            <Field label="厂区" count={plant ? plantLabel(plant) : '未选择'}>
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

            <Field
              label="机台"
              count={`${selectedMachines.length}/${visible.length}`}
              actions={
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="1"
                    color="gray"
                    onClick={() => setSelectedMachines([])}
                    disabled={!selectedMachines.length}
                  >
                    清空
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="1"
                    color="gray"
                    onClick={toggleAll}
                    disabled={!visible.length}
                  >
                    {visible.every((item) =>
                      selectedMachines.includes(item.name),
                    )
                      ? '取消本区'
                      : '全选本区'}
                  </Button>
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="1"
                    color="gray"
                    aria-label="重新识别机台"
                    disabled={saving}
                    onClick={() => void refresh()}
                  >
                    <ReloadIcon width={14} height={14} />
                  </IconButton>
                </>
              }
            >
              <TextField.Root
                size="2"
                value={keyword}
                placeholder="按机台名搜索，如 A03"
                spellCheck={false}
                onChange={(event) => setKeyword(event.target.value)}
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
                  options={visible.map((machine) => ({
                    value: machine.name,
                    label: (
                      <Text as="span" size="2" className="mono">
                        {machine.name}
                      </Text>
                    ),
                  }))}
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
              ? 'DC 根目录下没有可用机台，请点刷新重新识别'
              : settings?.rootPath === null && !draft
                ? '配置根目录后，这里会出现厂区与机台列表'
                : '正在识别机台…'}
          </Text>
        )}
      </Step>
    </Flex>
  )
}

export default ElSetupPanel
