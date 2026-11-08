import { ExclamationTriangleIcon } from '@radix-ui/react-icons'
import { Callout, Strong } from '@radix-ui/themes'

/**
 * 扫描页的提示条。
 *
 * 以前由 PlantScanPage 根据 `configured` / `activeMachines` 两个模式 props
 * 决定渲染哪一条；现在页面自己组合需要的提示，基座只留 `notices` 槽。
 */

interface UnconfiguredNoticeProps {
  title: string
  description: string
}

/** 还没有配置入口 / 根目录 */
export const UnconfiguredNotice = ({
  title,
  description,
}: UnconfiguredNoticeProps) => (
  <Callout.Root color="amber" size="1">
    <Callout.Icon>
      <ExclamationTriangleIcon width={14} height={14} />
    </Callout.Icon>
    <Callout.Text>
      <Strong>{title}：</Strong>
      {description}
    </Callout.Text>
  </Callout.Root>
)

/** 入口目录识别完了，但一台可用机台都没有 */
export const NoMachinesNotice = () => (
  <Callout.Root color="amber" size="1">
    <Callout.Icon>
      <ExclamationTriangleIcon width={14} height={14} />
    </Callout.Icon>
    <Callout.Text>
      <Strong>入口里没有可用机台：</Strong>
      请确认快捷方式的目标是网络路径（\\主机），本地路径会被跳过
    </Callout.Text>
  </Callout.Root>
)
