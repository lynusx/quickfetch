import type { ReactNode } from 'react'
import { Box, Card, Heading } from '@radix-ui/themes'

import './settings-group.css'

interface SettingsGroupProps {
  /** 深链滚动锚点，如 update */
  id?: string
  title: ReactNode
  children: ReactNode
}

/**
 * 设置页分区：标题在卡片外，卡片内是连续的行。
 *
 * 参考 switch-cc 的设置页：浅灰画布上放白色圆角卡片，标题与卡片之间
 * 只留一段间距。卡片本体与面板共用 `.app-card`，不再各写一套背景与描边。
 */
export const SettingsGroup = ({ id, title, children }: SettingsGroupProps) => (
  <Box id={id} className="settings-group">
    <Heading as="h2" size="3" weight="medium" mb="3">
      {title}
    </Heading>
    <Card variant="surface" className="app-card">
      {children}
    </Card>
  </Box>
)
