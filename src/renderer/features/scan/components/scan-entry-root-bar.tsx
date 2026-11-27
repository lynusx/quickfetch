import { useState } from 'react'
import { ChevronDown, Monitor, RefreshCw, TriangleAlert } from 'lucide-react'
import {
  Box,
  Button,
  Callout,
  Code,
  Flex,
  Heading,
  IconButton,
  Popover,
  Spinner,
  Text,
  TextField,
  Tooltip,
} from '@radix-ui/themes'

import { Panel, PanelBody } from '@/components/panel'
import { useToast } from '@/hooks/useToast'
import { selectCategoryConfig, useSettingsStore } from '@/features/settings'
import type { EntrySetupResult, ScanCategory, SkippedLink } from '@shared/ipc'
import { SCAN_CATEGORY_LABEL } from '@shared/scanCategories'

interface CategoryBarConfig {
  label: string
  placeholder: string
  pickTitle: string
  hint: string
}

const CATEGORY_CONFIG: Record<ScanCategory, CategoryBarConfig> = {
  lxt: {
    label: '入口目录',
    placeholder: '\\\\10.108.x.x\\share\\力禧特',
    pickTitle: '选择力禧特快捷方式入口目录',
    hint: '每个含 .lnk 的子目录识别为一个厂区，机台地址来自快捷方式目标。',
  },
  pl: {
    label: '入口目录',
    placeholder: '\\\\10.108.x.x\\share\\利珀',
    pickTitle: '选择利珀快捷方式入口目录',
    hint: '每个含 .lnk 的子目录识别为一个厂区，机台地址来自快捷方式目标。',
  },
  aoi: {
    label: '入口目录',
    placeholder: '\\\\10.108.x.x\\share\\森标-在线AOI',
    pickTitle: '选择森标 AOI 快捷方式入口目录',
    hint: '每个含 .lnk 的子目录识别为一个厂区，机台地址来自快捷方式目标。',
  },
  el: {
    label: 'DC 根目录',
    placeholder: '\\\\10.108.164.2\\qj-dc-el\\DC',
    pickTitle: '请选择 DC 根目录',
    hint: '目录层级需为 DC/<机台>/EL/<日期>/<班次>/<时段>/<类型>。',
  },
}

/** 取路径末段作为标题栏紧凑触发器的可读标签 */
const extractDirTail = (path: string): string => {
  const segments = path.split(/[\\/]+/).filter(Boolean)
  return segments[segments.length - 1] ?? path
}

const useEntryRootActions = (
  category: ScanCategory,
  onChanged?: () => void,
) => {
  const { showToast } = useToast()

  const categoryConfig = useSettingsStore(selectCategoryConfig(category))
  const saving = useSettingsStore((state) => state.saving)
  const error = useSettingsStore((state) => state.error)
  const setupEntry = useSettingsStore((state) => state.setupEntry)
  const refreshEntry = useSettingsStore((state) => state.refreshEntry)

  const entryRoot = categoryConfig.entryRoot
  const skipped: SkippedLink[] = category === 'el' ? [] : categoryConfig.skipped

  const [draft, setDraft] = useState(entryRoot ?? '')
  const [prevEntryRoot, setPrevEntryRoot] = useState(entryRoot)

  if (entryRoot !== prevEntryRoot) {
    setPrevEntryRoot(entryRoot)
    setDraft(entryRoot ?? '')
  }

  const announce = (result: EntrySetupResult | null, path?: string) => {
    if (!result) return

    if (category === 'el') {
      showToast(
        path ? 'DC 根目录已更新' : '机台已重新识别',
        path ?? entryRoot ?? '',
        'info',
      )
      onChanged?.()
      return
    }

    const parts = [`${result.added} 台新增`]
    if (result.removed) parts.push(`${result.removed} 台已从入口移除`)
    if (result.relocated) parts.push(`${result.relocated} 台位置已更新`)

    showToast('机台识别完成', parts.join('，') || '机台列表无变化', 'info')
    onChanged?.()
  }

  const runRefresh = async (): Promise<void> => {
    announce(await refreshEntry(category))
  }

  const pickRoot = async () => {
    const config = CATEGORY_CONFIG[category]
    const picked = await window.electronAPI.pickDirectory({
      title: config.pickTitle,
    })
    if (!picked) return

    setDraft(picked.path)
    const result = await setupEntry(category, picked.path)
    announce(result, picked.path)
  }

  const commitDraft = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === (entryRoot ?? '')) return
    const result = await setupEntry(category, trimmed)
    announce(result, trimmed)
  }

  return {
    config: CATEGORY_CONFIG[category],
    entryRoot,
    skipped,
    saving,
    error,
    draft,
    setDraft,
    pickRoot,
    commitDraft,
    runRefresh,
  }
}

interface ScanEntryRootBarProps {
  category: ScanCategory
  disabled?: boolean
  onChanged?: () => void
}

/**
 * 扫描页吸顶标题栏右侧的紧凑「入口目录触发器」。
 *
 * 日常只显示目录末段名与 Tooltip 完整路径，点击展开 Popover 修改、选择或重新识别；
 * 未配置时高亮提醒。扫描进行中禁用，防止任务执行中途篡改入口。
 */
export const ScanEntryRootBar = ({
  category,
  disabled = false,
  onChanged,
}: ScanEntryRootBarProps) => {
  const {
    config,
    entryRoot,
    saving,
    error,
    draft,
    setDraft,
    pickRoot,
    commitDraft,
    runRefresh,
  } = useEntryRootActions(category, onChanged)

  const [open, setOpen] = useState(false)
  const isDisabled = disabled || saving
  const configured = Boolean(entryRoot)

  const triggerButton = (
    <Button
      type="button"
      size="2"
      variant="soft"
      color={configured ? 'gray' : undefined}
      disabled={isDisabled}
    >
      <Monitor size={14} strokeWidth={1.75} />
      <Box maxWidth="160px" overflow="hidden">
        <Text size="2" truncate>
          {configured && entryRoot
            ? extractDirTail(entryRoot)
            : `配置${config.label}`}
        </Text>
      </Box>
      <ChevronDown size={12} strokeWidth={1.75} />
    </Button>
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {configured && entryRoot ? (
        <Tooltip content={entryRoot}>
          <Popover.Trigger>{triggerButton}</Popover.Trigger>
        </Tooltip>
      ) : (
        <Popover.Trigger>{triggerButton}</Popover.Trigger>
      )}

      <Popover.Content width="400px" align="end">
        <Flex direction="column" gap="3">
          <Flex align="center" justify="between" gap="2">
            <Text size="2" weight="medium">
              {config.label}
            </Text>
            {configured ? (
              <IconButton
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                aria-label={
                  category === 'lxt' || category === 'pl'
                    ? '重新识别入口并探测共享'
                    : '重新识别机台'
                }
                title={
                  category === 'lxt' || category === 'pl'
                    ? '重新识别入口并探测共享'
                    : '重新识别机台'
                }
                disabled={isDisabled}
                onClick={() => void runRefresh()}
              >
                {saving ? (
                  <Spinner size="1" />
                ) : (
                  <RefreshCw size={13} strokeWidth={1.75} />
                )}
              </IconButton>
            ) : null}
          </Flex>

          <Flex align="center" gap="2" minWidth="0">
            <Box flexGrow="1" minWidth="0">
              <TextField.Root
                size="2"
                value={draft}
                placeholder={config.placeholder}
                disabled={isDisabled}
                title={draft || undefined}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commitDraft()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void commitDraft()
                  }
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
                disabled={isDisabled}
                onClick={() => void pickRoot()}
              >
                选择目录
              </Button>
            </Box>
          </Flex>

          <Text size="1" color="gray">
            {config.hint}
          </Text>

          {error ? (
            <Callout.Root color="red" size="1">
              <Callout.Icon>
                <TriangleAlert size={14} strokeWidth={1.75} />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          ) : null}
        </Flex>
      </Popover.Content>
    </Popover.Root>
  )
}

interface ScanEntrySetupCardProps {
  category: ScanCategory
  /** 已配置目录但识别出 0 台可用机台 */
  noMachines?: boolean
  onChanged?: () => void
}

/**
 * 未配置入口目录或识别出 0 台机台时的居中单卡引导态。
 *
 * 替代旧版「空参数矩阵 + 告警条 + 空任务卡」的三重占位，
 * 配置成功后立即切换为完整工作台。
 */
export const ScanEntrySetupCard = ({
  category,
  noMachines = false,
  onChanged,
}: ScanEntrySetupCardProps) => {
  const {
    config,
    entryRoot,
    skipped,
    saving,
    error,
    draft,
    setDraft,
    pickRoot,
    commitDraft,
    runRefresh,
  } = useEntryRootActions(category, onChanged)

  const title = noMachines
    ? `${SCAN_CATEGORY_LABEL[category]}入口里没有可用机台`
    : `配置${SCAN_CATEGORY_LABEL[category]}${config.label}`

  const description = noMachines
    ? category === 'el'
      ? 'DC 根目录下未识别到机台子目录，请确认路径正确后重试。'
      : '请确认入口目录内包含指向网络路径（\\\\主机）的 .lnk 快捷方式，本地路径会被跳过。'
    : config.hint

  return (
    <Flex
      align="center"
      justify="center"
      minHeight="calc(100vh - var(--app-page-header-height) - 180px)"
      pt="4"
      pb="8"
    >
      <Box width="100%" maxWidth="560px">
        <Panel>
          <PanelBody>
            <Flex direction="column" gap="4">
              <Flex direction="column" gap="1">
                <Heading as="h2" size="3">
                  {title}
                </Heading>
                <Text size="2" color="gray">
                  {description}
                </Text>
              </Flex>

              <Flex align="center" gap="2" minWidth="0">
                <Box flexGrow="1" minWidth="0">
                  <TextField.Root
                    size="2"
                    value={draft}
                    placeholder={config.placeholder}
                    disabled={saving}
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
                    disabled={saving}
                    onClick={() => void pickRoot()}
                  >
                    {entryRoot ? '更换目录' : '选择目录'}
                  </Button>
                </Box>
                {noMachines && entryRoot ? (
                  <Box flexShrink="0">
                    <Button
                      type="button"
                      size="2"
                      variant="soft"
                      color="gray"
                      disabled={saving}
                      onClick={() => void runRefresh()}
                    >
                      <RefreshCw size={14} strokeWidth={1.75} />
                      重新识别
                    </Button>
                  </Box>
                ) : null}
              </Flex>

              {error ? (
                <Callout.Root color="red" size="1">
                  <Callout.Icon>
                    <TriangleAlert size={14} strokeWidth={1.75} />
                  </Callout.Icon>
                  <Callout.Text>{error}</Callout.Text>
                </Callout.Root>
              ) : null}

              {skipped.length > 0 ? (
                <Box asChild p="2">
                  <details className="skipped-box" open>
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
              ) : null}
            </Flex>
          </PanelBody>
        </Panel>
      </Box>
    </Flex>
  )
}

export default ScanEntryRootBar
