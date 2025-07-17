import type { FC } from 'react'
import { Dialog, Button, Flex } from '@radix-ui/themes'

interface PwaUpdateDialogProps {
  open: boolean
  onClose: () => void
  onRefresh: () => void
}

const PwaUpdateDialog: FC<PwaUpdateDialogProps> = ({
  open,
  onClose,
  onRefresh,
}) => {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Content maxWidth="400px">
        <Dialog.Title>检测到新版本</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          有新版本可用，是否立即刷新体验最新内容？
        </Dialog.Description>
        <Flex gap="3" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              取消
            </Button>
          </Dialog.Close>
          <Button onClick={onRefresh}>立即刷新</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}

export default PwaUpdateDialog
