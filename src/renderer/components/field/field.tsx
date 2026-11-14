import type { ReactNode } from 'react'
import { Box, Flex, Text } from '@radix-ui/themes'

import './field.css'

interface FieldProps {
  label: ReactNode
  icon?: ReactNode
  /** 已选 / 总数，跟在标题后面 */
  count?: ReactNode
  /** 右侧的「全选 / 清空 / 编辑」等轻操作 */
  actions?: ReactNode
  hint?: ReactNode
  children: ReactNode
}

/** 表单字段的统一标题行：标题 + 计数 + 右侧操作，避免每处各写一套 */
export const Field = ({
  label,
  icon,
  count,
  actions,
  hint,
  children,
}: FieldProps) => (
  <Flex direction="column" gap="2">
    <Flex align="center" justify="between" gap="3" minHeight="22px">
      <Flex align="center" gap="2" minWidth="0">
        {icon ? (
          <Box as="span" className="field-label-icon">
            {icon}
          </Box>
        ) : null}
        <Text size="1" weight="medium">
          {label}
        </Text>
        {count != null ? (
          <Text size="1" weight="medium" className="field-count">
            {count}
          </Text>
        ) : null}
      </Flex>
      {actions ? (
        <Flex align="center" gap="1" flexShrink="0">
          {actions}
        </Flex>
      ) : null}
    </Flex>
    {children}
    {hint ? (
      <Text as="p" size="1" className="field-hint">
        {hint}
      </Text>
    ) : null}
  </Flex>
)

interface StepProps {
  index: number
  /** 该步骤的条件已经选齐 */
  done?: boolean
  children: ReactNode
}

/** 带编号的步骤块，用来说明「先选机台、再选日期」的顺序 */
export const Step = ({ index, done, children }: StepProps) => (
  <Flex className="step" data-done={done || undefined} gap="3">
    <Flex
      className="step-index"
      align="center"
      justify="center"
      width="22px"
      height="22px"
      flexShrink="0"
    >
      <Text size="1" weight="bold" className="tabular">
        {String(index).padStart(2, '0')}
      </Text>
    </Flex>
    <Box flexGrow="1" minWidth="0">
      {children}
    </Box>
  </Flex>
)

export default Field
