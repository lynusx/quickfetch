import type { ReactNode } from 'react'
import { Heading } from '@radix-ui/themes'

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
 * 只留一段间距。标题、卡片与行分隔的关系固定在这里，各分区不再各写一遍。
 */
export const SettingsGroup = ({ id, title, children }: SettingsGroupProps) => (
  <section id={id} className="settings-group">
    <Heading as="h2" className="settings-group-title">
      {title}
    </Heading>
    <div className="settings-card">{children}</div>
  </section>
)
