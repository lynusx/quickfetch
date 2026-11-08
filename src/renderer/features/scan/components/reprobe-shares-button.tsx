import { useState } from 'react'
import { Button, Spinner } from '@radix-ui/themes'

import { useToast } from '@/hooks/useToast'

interface ReprobeSharesButtonProps {
  /** 入口正在保存/识别时一并禁用 */
  saving?: boolean
  /** 各走各的类别通道：力禧特与利珀分别探测 */
  onReprobe: () => Promise<boolean>
}

/**
 * 「重新探测共享」按钮。
 *
 * 以前是 PlantMachinePicker 的可选回调 prop，按钮里的探测中状态、Spinner
 * 与成功提示都塞在共享基座里；现在由需要它的两个页面显式组合进
 * `machineListActions` 槽，基座不再知道「探测共享」这件事。
 */
export const ReprobeSharesButton = ({
  saving = false,
  onReprobe,
}: ReprobeSharesButtonProps) => {
  const { showToast } = useToast()
  /** 46 台要跑几十秒，按钮必须置灰防连点 */
  const [probing, setProbing] = useState(false)

  return (
    <Button
      type="button"
      variant="ghost"
      color="gray"
      size="1"
      disabled={saving || probing}
      title="重新探测各机台的共享目录，现场换了共享名或当初没连上网时用"
      onClick={async () => {
        setProbing(true)

        try {
          const ok = await onReprobe()

          if (ok) {
            showToast(
              '共享探测完成',
              '机台列表尾部的徽标已更新，可以开始扫描',
              'info',
            )
          }
        } finally {
          setProbing(false)
        }
      }}
    >
      {probing ? <Spinner size="1" /> : null}
      重新探测共享
    </Button>
  )
}
