import { Badge } from '@radix-ui/themes'
import type { ScanTaskStatus } from '@shared/ipc'
import { SCAN_STATUS_META } from './scanStatus'

export const ScanStatusBadge = ({
  status,
  size = '2',
}: {
  status: ScanTaskStatus
  size?: '1' | '2' | '3'
}) => {
  const meta = SCAN_STATUS_META[status]

  return (
    <Badge color={meta.color} variant={meta.variant} size={size}>
      {meta.label}
    </Badge>
  )
}

export default ScanStatusBadge
