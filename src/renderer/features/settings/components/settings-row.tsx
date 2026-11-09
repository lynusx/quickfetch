import type { ReactNode } from 'react'
import { InfoCircledIcon } from '@radix-ui/react-icons'
import { IconButton, Text, Tooltip } from '@radix-ui/themes'

import { cn } from '@/lib/utils'
import './settings-row.css'

interface SettingsRowProps {
  label: string
  /** 一行必要说明；长解释改用 tooltip */
  hint?: ReactNode
  /** 长解释；有值时在标签后显示可聚焦的 ⓘ */
  tooltip?: string
  children?: ReactNode
  /** 控件放到标签下方并占满整行（RadioCards 等） */
  stacked?: boolean
  className?: string
}

/**
 * 设置行：左侧标签与说明，右侧控件。
 *
 * 行高统一为 52px（滑杆行会自然更高）；分隔线只在行与行之间，
 * 卡片本身由 SettingsGroup 负责。
 */
export const SettingsRow = ({
  label,
  hint,
  tooltip,
  children,
  stacked,
  className,
}: SettingsRowProps) => (
  <div
    className={cn('settings-row', stacked && 'settings-row-stacked', className)}
  >
    <div className="settings-row-main">
      <div className="settings-row-label-line">
        <Text as="p" size="2" weight="medium" className="settings-row-label">
          {label}
        </Text>
        {tooltip ? (
          <Tooltip content={tooltip}>
            <IconButton
              type="button"
              variant="ghost"
              color="gray"
              size="1"
              className="settings-row-info"
              aria-label={`${label}说明`}
            >
              <InfoCircledIcon width={13} height={13} />
            </IconButton>
          </Tooltip>
        ) : null}
      </div>
      {hint ? (
        <Text as="p" size="1" color="gray" className="settings-row-hint">
          {hint}
        </Text>
      ) : null}
    </div>
    {children ? <div className="settings-row-control">{children}</div> : null}
  </div>
)
