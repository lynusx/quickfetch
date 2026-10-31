import { useEffect, useMemo, useState } from 'react'
import { FileIcon, ReloadIcon } from '@radix-ui/react-icons'
import { Button, Flex, IconButton, Text, TextField } from '@radix-ui/themes'

import { ChoiceList, ChoiceRadio } from '@/components/ChoiceList'
import { useImageFilterStore } from '../stores/imageFilterStore'
import { useSettingsStore } from '@/features/settings'
import type { Plant } from '@shared/ipc'
import { plantLabel } from '@shared/ipc'

/** 机台名按自然序：A02 排在 A01 之后而不是 A10 之后 */
const compare = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

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
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="medium">
          DC 根目录
        </Text>
        <TextField.Root
          size="2"
          value={draft}
          placeholder="\\10.108.164.2\qj-dc-el\DC"
          spellCheck={false}
          style={{ fontFamily: 'var(--code-font-family)' }}
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
      </Flex>

      {configured && machines.length > 0 ? (
        <>
          <Flex direction="column" gap="1">
            <Flex justify="between" align="center">
              <Text as="label" size="2" weight="medium">
                厂区
              </Text>
              <Text size="1" color="gray">
                {plant ? plantLabel(plant) : '未选择'}
              </Text>
            </Flex>
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
          </Flex>

          <Flex direction="column" gap="2">
            <Flex justify="between" align="center">
              <Flex align="center" gap="2">
                <Text as="label" size="2" weight="medium">
                  机台
                </Text>
                <Text size="1" color="gray">
                  {selectedMachines.length}/{visible.length}
                </Text>
              </Flex>
              <Flex align="center" gap="1">
                <Button
                  type="button"
                  variant="ghost"
                  size="1"
                  onClick={() => setSelectedMachines([])}
                  disabled={!selectedMachines.length}
                >
                  清空
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="1"
                  onClick={toggleAll}
                  disabled={!visible.length}
                >
                  {visible.every((item) => selectedMachines.includes(item.name))
                    ? '取消本区'
                    : '全选本区'}
                </Button>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="1"
                  aria-label="重新识别机台"
                  disabled={saving}
                  onClick={() => void refresh()}
                >
                  <ReloadIcon width={14} height={14} />
                </IconButton>
              </Flex>
            </Flex>

            <TextField.Root
              size="2"
              value={keyword}
              placeholder="按机台名搜索，如 A03"
              spellCheck={false}
              onChange={(event) => setKeyword(event.target.value)}
            />

            {visible.length ? (
              <ChoiceList
                columns={2}
                scroll
                value={selectedMachines}
                onValueChange={setSelectedMachines}
                options={visible.map((machine) => ({
                  value: machine.name,
                  label: (
                    <Text
                      size="2"
                      style={{ fontFamily: 'var(--code-font-family)' }}
                    >
                      {machine.name}
                    </Text>
                  ),
                }))}
              />
            ) : (
              <Text size="2" color="gray">
                没有匹配「{keyword}」的机台
              </Text>
            )}
          </Flex>
        </>
      ) : (
        <Text size="2" color="gray">
          {configured
            ? 'DC 根目录下没有可用机台，请点刷新重新识别'
            : settings?.rootPath === null && !draft
              ? '输入或选择 DC 根目录后，会自动识别其中的机台'
              : '正在识别机台…'}
        </Text>
      )}
    </Flex>
  )
}

export default ScanSetupPanel
