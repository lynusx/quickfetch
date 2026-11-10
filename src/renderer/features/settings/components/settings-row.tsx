import type { ReactNode } from 'react'
import { Box, Flex, Text } from '@radix-ui/themes'

import { HelpTip } from '@/components/help-tip/help-tip'
import { cn } from '@/lib/utils'
import './settings-row.css'

interface SettingsRowProps {
  label: string
  /** 名称下只放真实数据（路径、版本、时间），解释性文字走 help */
  description?: ReactNode
  /** 规则与原因；有值时在名称后显示 `?` 说明卡 */
  help?: ReactNode
  children?: ReactNode
  className?: string
}

interface SettingsLabelProps {
  label: string
  /** 规则与原因；有值时在名称后显示 `?` 说明卡 */
  help?: ReactNode
}

/** 设置项名称 + 说明卡入口；滑杆行等自定义行也复用它 */
export const SettingsLabel = ({ label, help }: SettingsLabelProps) => (
  <Flex align="center" gap="6px">
    <Text as="p" size="2" weight="medium" className="settings-row-label">
      {label}
    </Text>
    {help ? <HelpTip title={label}>{help}</HelpTip> : null}
  </Flex>
)

/**
 * 设置行：左侧标签（+ 说明卡入口），右侧控件。
 *
 * 行高统一为 52px；分隔线只在行与行之间，卡片本身由 SettingsGroup 负责。
 * 名称下只放真实数据，规则、术语与原因收进 `?`，避免每行拖一行灰色小字。
 */
export const SettingsRow = ({
  label,
  description,
  help,
  children,
  className,
}: SettingsRowProps) => (
  <Flex
    className={cn('settings-row', className)}
    align="center"
    justify="between"
    gap="20px"
    minHeight="52px"
    p="10px 16px"
  >
    <Box flexGrow="1" flexShrink="1" flexBasis="0" minWidth="0" maxWidth="50%">
      <SettingsLabel label={label} help={help} />
      {description ? (
        <Text as="p" size="1" color="gray" className="settings-row-description">
          {description}
        </Text>
      ) : null}
    </Box>
    {children ? (
      <Flex
        className="settings-row-control"
        align="center"
        gap="2"
        flexShrink="0"
        minWidth="0"
        maxWidth="50%"
      >
        {children}
      </Flex>
    ) : null}
  </Flex>
)
