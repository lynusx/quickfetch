import { ChevronDown, Search } from 'lucide-react'
import { Badge, Box, Button, Flex, Text, Tooltip } from '@radix-ui/themes'
import { useShallow } from 'zustand/react/shallow'

import { Panel } from '@/components/panel'
import { scanScopeOf } from '../scanScope'
import type { ScanCategory } from '@shared/ipc'
import { AOI_IMAGE_KIND_LABEL, plantLabel } from '@shared/ipc'

const formatDateLabel = (date: string): string =>
  date.length === 8
    ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`
    : date

interface ScopeSummaryBarProps {
  category: ScanCategory
  busy: boolean
  onExpand: () => void
}

/**
 * 折叠态的单行扫描范围摘要条（Scope Summary Bar）。
 *
 * 扫描启动或历史恢复后替换展开态的 Scope Parameter Matrix，
 * 用单行紧凑标签保留当前筛选上下文，把首屏空间让给任务进度与结果表。
 */
export const ScopeSummaryBar = ({
  category,
  busy,
  onExpand,
}: ScopeSummaryBarProps) => {
  const scope = scanScopeOf(category)
  const state = scope.store(
    useShallow((store) => ({
      plant: store.plant,
      selectedMachines: store.selectedMachines,
      date: store.date,
      shift: store.shift,
      slots: store.slots,
      types: store.types,
      levels: store.levels,
      imageKind: store.imageKind,
    })),
  )

  const segments: string[] = []
  const plantText = state.plant ? plantLabel(state.plant) : ''
  segments.push(
    plantText
      ? `${plantText} ${state.selectedMachines.length} 台`
      : `${state.selectedMachines.length} 台机台`,
  )

  if (state.date) {
    segments.push(`${formatDateLabel(state.date)} ${state.shift}`)
  }

  if (category !== 'aoi' && state.slots.length > 0) {
    segments.push(`${state.slots.length} 时段`)
  }

  if (category === 'pl' && state.levels.length > 0) {
    segments.push(`等级 ${state.levels.join('/')}`)
  }

  if (category === 'aoi') {
    segments.push(AOI_IMAGE_KIND_LABEL[state.imageKind])
  }

  if (state.types.length > 0) {
    segments.push(
      state.types.length <= 2
        ? state.types.join('、')
        : `${state.types.slice(0, 2).join('、')} 等 ${state.types.length} 类`,
    )
  }

  const tooltipDetail = [
    state.selectedMachines.length > 0
      ? `机台：${state.selectedMachines.join('、')}`
      : null,
    state.types.length > 0 ? `类型：${state.types.join('、')}` : null,
  ]
    .filter(Boolean)
    .join('\n')

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

          <Tooltip content={tooltipDetail || '当前扫描范围'}>
            <Box minWidth="0" flexGrow="1">
              <Text size="2" weight="medium" truncate className="tabular">
                {segments.join(' · ')}
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
