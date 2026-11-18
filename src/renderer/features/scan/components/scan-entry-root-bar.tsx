import { useState } from 'react'
import { Box, Button, Flex, TextField } from '@radix-ui/themes'

import { useToast } from '@/hooks/useToast'
import {
  selectAoi,
  selectEl,
  selectLxt,
  selectPl,
  useSettingsStore,
} from '@/features/settings'
import type { EntrySetupResult, ScanCategory } from '@shared/ipc'

interface CategoryBarConfig {
  placeholder: string
  pickTitle: string
}

const CATEGORY_CONFIG: Record<ScanCategory, CategoryBarConfig> = {
  lxt: {
    placeholder: '\\\\10.108.x.x\\share\\力禧特',
    pickTitle: '选择力禧特快捷方式入口目录',
  },
  pl: {
    placeholder: '\\\\10.108.x.x\\share\\利珀',
    pickTitle: '选择利珀快捷方式入口目录',
  },
  aoi: {
    placeholder: '\\\\10.108.x.x\\share\\森标-在线AOI',
    pickTitle: '选择森标 AOI 快捷方式入口目录',
  },
  el: {
    placeholder: '\\\\10.108.164.2\\qj-dc-el\\DC',
    pickTitle: '请选择 DC 根目录',
  },
}

interface ScanEntryRootBarProps {
  category: ScanCategory
  disabled?: boolean
  onChanged?: () => void
}

/**
 * 扫描页吸顶标题栏右侧的「入口目录选择区」。
 *
 * 包含 UNC 路径输入框与「选择目录」按钮，与左侧页面标题两端对齐。
 * 输入框支持按断点自适应（md~lg 兼顾 14 寸笔记本与 23 寸大屏）；
 * 任务进行中（disabled）自动置灰防篡改。
 */
export const ScanEntryRootBar = ({
  category,
  disabled = false,
  onChanged,
}: ScanEntryRootBarProps) => {
  const { showToast } = useToast()

  const lxt = useSettingsStore(selectLxt)
  const pl = useSettingsStore(selectPl)
  const aoi = useSettingsStore(selectAoi)
  const el = useSettingsStore(selectEl)

  const saving = useSettingsStore((state) => state.saving)
  const setupLxt = useSettingsStore((state) => state.setupLxt)
  const setupPl = useSettingsStore((state) => state.setupPl)
  const setupAoi = useSettingsStore((state) => state.setupAoi)
  const saveRoot = useSettingsStore((state) => state.saveRoot)

  const entryRoot =
    category === 'lxt'
      ? lxt.entryRoot
      : category === 'pl'
        ? pl.entryRoot
        : category === 'aoi'
          ? aoi.entryRoot
          : el.entryRoot

  const [draft, setDraft] = useState(entryRoot ?? '')
  const [prevEntryRoot, setPrevEntryRoot] = useState(entryRoot)

  if (entryRoot !== prevEntryRoot) {
    setPrevEntryRoot(entryRoot)
    setDraft(entryRoot ?? '')
  }

  const announce = (result: EntrySetupResult | null, path: string) => {
    if (category === 'el') {
      showToast('DC 根目录已更新', path, 'info')
      onChanged?.()
      return
    }

    if (!result) return
    const parts = [`${result.added} 台新增`]
    if (result.removed) parts.push(`${result.removed} 台已从入口移除`)
    if (result.relocated) parts.push(`${result.relocated} 台位置已更新`)

    showToast('机台识别完成', parts.join('，') || '机台列表无变化', 'info')
    onChanged?.()
  }

  const runSetup = async (path: string): Promise<EntrySetupResult | null> => {
    if (category === 'lxt') return setupLxt(path)
    if (category === 'pl') return setupPl(path)
    if (category === 'aoi') return setupAoi(path)

    await saveRoot(path)
    return null
  }

  const pickRoot = async () => {
    const config = CATEGORY_CONFIG[category]
    const picked = await window.electronAPI.pickDirectory({
      title: config.pickTitle,
    })
    if (!picked) return

    setDraft(picked.path)
    const result = await runSetup(picked.path)
    announce(result, picked.path)
  }

  const commitDraft = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === (entryRoot ?? '')) return
    const result = await runSetup(trimmed)
    announce(result, trimmed)
  }

  const config = CATEGORY_CONFIG[category]
  const isControlDisabled = disabled || saving

  return (
    <Flex align="center" gap="2" minWidth="0">
      <Box
        width={{
          initial: '200px',
          sm: '240px',
          md: '280px',
          lg: '380px',
          xl: '440px',
        }}
        minWidth="160px"
        flexShrink="1"
      >
        <TextField.Root
          size="2"
          value={draft}
          placeholder={config.placeholder}
          disabled={isControlDisabled}
          title={draft || undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitDraft()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitDraft()
          }}
          className="dir-input"
        />
      </Box>

      <Box flexShrink="0">
        <Button
          type="button"
          size="2"
          variant="soft"
          color="gray"
          disabled={isControlDisabled}
          onClick={() => void pickRoot()}
        >
          选择目录
        </Button>
      </Box>
    </Flex>
  )
}

export default ScanEntryRootBar
