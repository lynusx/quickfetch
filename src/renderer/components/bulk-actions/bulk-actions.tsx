import type { ReactNode } from 'react'
import { CheckIcon, CircleBackslashIcon } from '@radix-ui/react-icons'
import { Button } from '@radix-ui/themes'

interface BulkActionsProps {
  /** 清空已选；不传就不渲染清空按钮 */
  onClear?: () => void
  clearDisabled?: boolean
  /** 清空按钮是否带图标；默认不带，和多数调用处一致 */
  clearIcon?: boolean
  /** 全选 / 取消全选 */
  onToggleAll: () => void
  /** 当前是否已全选，决定按钮文案 */
  allSelected?: boolean
  /** 未全选时的文案 */
  selectLabel?: string
  /** 已全选时的文案 */
  cancelLabel?: string
  toggleDisabled?: boolean
  /** 全选按钮是否带图标；默认不带 */
  toggleIcon?: boolean
  /** 追加操作，例如「编辑」或「重新识别」 */
  extra?: ReactNode
}

/**
 * 列表批量操作：清空 + 全选 / 取消全选。
 *
 * 这两个按钮在筛选字段、机台列表与复制面板里反复出现，文案与禁用条件
 * 各不相同，但按钮形态一致。图标默认关闭，各调用处按现有界面决定是否显示。
 */
export const BulkActions = ({
  onClear,
  clearDisabled,
  clearIcon = false,
  onToggleAll,
  allSelected = false,
  selectLabel = '全选',
  cancelLabel = '取消全选',
  toggleDisabled,
  toggleIcon = false,
  extra,
}: BulkActionsProps) => (
  <>
    {onClear ? (
      <Button
        type="button"
        variant="ghost"
        color="gray"
        size="1"
        disabled={clearDisabled}
        onClick={onClear}
      >
        {clearIcon ? <CircleBackslashIcon width={13} height={13} /> : null}
        清空
      </Button>
    ) : null}

    <Button
      type="button"
      variant="ghost"
      color="gray"
      size="1"
      disabled={toggleDisabled}
      onClick={onToggleAll}
    >
      {toggleIcon ? <CheckIcon width={13} height={13} /> : null}
      {allSelected ? cancelLabel : selectLabel}
    </Button>

    {extra}
  </>
)

export default BulkActions
