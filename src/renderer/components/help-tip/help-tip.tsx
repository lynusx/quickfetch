import type { FocusEvent, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { QuestionMarkCircledIcon } from '@radix-ui/react-icons'
import { IconButton, Popover, Text, VisuallyHidden } from '@radix-ui/themes'

import './help-tip.css'

/** 悬停多久打开 / 移开多久关闭；移进说明卡会取消关闭 */
const OPEN_DELAY = 300
const CLOSE_DELAY = 200

interface HelpTipProps {
  /** 卡片标题，同时作为触发按钮的无障碍名字 */
  title: string
  /** 说明正文：规则、术语与原因，不放会丢数据之类的后果 */
  children: ReactNode
}

/**
 * 设置项名称旁的「?」说明卡。
 *
 * 悬停打开、移开关闭，点击可固定，键盘聚焦立即打开；Esc 或点别处关闭。
 * 打开时把焦点留在触发按钮上，Tab 仍按页面顺序前进；屏幕阅读器读
 * VisuallyHidden 里那份一直都在的副本。
 */
export const HelpTip = ({ title, children }: HelpTipProps) => {
  const id = useId()
  const descriptionId = `${id}-desc`
  const titleId = `${id}-title`
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const clearTimer = () => {
    if (timer.current === undefined) return

    window.clearTimeout(timer.current)
    timer.current = undefined
  }

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current)
    },
    [],
  )

  const schedule = (next: boolean, delay: number) => {
    clearTimer()
    timer.current = window.setTimeout(() => setOpen(next), delay)
  }

  const handlePointerEnter = () => {
    if (!pinned) schedule(true, OPEN_DELAY)
  }

  const handlePointerLeave = () => {
    if (!pinned) schedule(false, CLOSE_DELAY)
  }

  const handleFocus = (event: FocusEvent<HTMLButtonElement>) => {
    // 只认键盘聚焦；鼠标点开时焦点可能落到按钮上，不应该顺带弹卡
    let keyboard = true

    try {
      keyboard = event.currentTarget.matches(':focus-visible')
    } catch {
      // 浏览器不认 :focus-visible 时按键盘处理
    }

    if (!keyboard) return

    clearTimer()
    setOpen(true)
  }

  const handleBlur = () => {
    if (pinned) return

    clearTimer()
    setOpen(false)
  }

  return (
    <Popover.Root
      open={open || pinned}
      onOpenChange={(next) => {
        if (next) return

        clearTimer()
        setPinned(false)
        setOpen(false)
      }}
    >
      <VisuallyHidden id={descriptionId}>{children}</VisuallyHidden>
      <Popover.Trigger>
        <IconButton
          type="button"
          variant="ghost"
          color="gray"
          size="1"
          className="help-tip-trigger"
          aria-label={`${title}说明`}
          aria-describedby={descriptionId}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onClick={(event) => {
            // 阻止 Popover 自带的“再点一次就关闭”，点击只负责固定 / 取消固定
            event.preventDefault()
            clearTimer()
            setOpen(true)
            setPinned((value) => !value)
          }}
        >
          <QuestionMarkCircledIcon width={13} height={13} />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content
        role="tooltip"
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        maxWidth="300px"
        aria-labelledby={titleId}
        className="help-tip-content"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <Text
          as="p"
          size="2"
          weight="bold"
          id={titleId}
          mb="4px"
          className="help-tip-title"
        >
          {title}
        </Text>
        <Text as="p" size="1" className="help-tip-text">
          {children}
        </Text>
      </Popover.Content>
    </Popover.Root>
  )
}
