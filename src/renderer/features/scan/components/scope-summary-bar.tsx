import { ChevronDown, Search } from 'lucide-react'
import { Badge, Box, Button, Flex, Text, Tooltip } from '@radix-ui/themes'

import { Panel } from '@/components/panel'
import { useSettingsStore } from '@/features/settings'
import type { ScanCategory } from '@shared/ipc'

import { useScanScopeView } from '../scanScope'

interface ScopeSummaryBarProps {
  category: ScanCategory
  busy: boolean
  onExpand: () => void
}

/**
 * 折叠态的单行扫描范围摘要条（Scope Summary Bar）。
 *
 * 摘要分段与悬停明细直接来自 `Scan Scope` 派生模型，不再维护第二份按类别分支规则。
 */
export const ScopeSummaryBar = ({
  category,
  busy,
  onExpand,
}: ScopeSummaryBarProps) => {
  const settings = useSettingsStore((state) => state.settings)
  const { summarySegments, summaryTooltip } = useScanScopeView(
    category,
    settings,
  )

  return (
    <Panel>
      <Flex align="center" justify="between" gap="3" px="4" py="2">
        <Flex align="center" gap="2" minWidth="0" flexGrow="1">
          <Box flexShrink="0">
            <Flex
              className="panel-icon"
              align="center"
              justify="center"
              width="24px"
              height="24px"
            >
              <Search size={15} strokeWidth={1.75} />
            </Flex>
          </Box>

          <Tooltip content={summaryTooltip || '当前扫描范围'}>
            <Box minWidth="0" flexGrow="1">
              <Text size="2" weight="medium" truncate className="tabular">
                {summarySegments.join(' · ')}
              </Text>
            </Box>
          </Tooltip>

          {busy ? (
            <Box flexShrink="0">
              <Badge color="blue" size="1">
                扫描中
              </Badge>
            </Box>
          ) : null}
        </Flex>

        <Box flexShrink="0">
          <Button type="button" variant="soft" color="gray" onClick={onExpand}>
            {busy ? '查看范围' : '修改范围'}
            <ChevronDown size={14} strokeWidth={1.75} />
          </Button>
        </Box>
      </Flex>
    </Panel>
  )
}

export default ScopeSummaryBar
