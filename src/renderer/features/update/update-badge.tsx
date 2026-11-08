import { Link } from 'react-router'
import { Badge } from '@radix-ui/themes'

import { ROUTES } from '@/routes/paths'
import { useUpdateStore } from './updateStore'

/** 有新版本时在侧边栏版本号旁给一个入口，不打断当前操作 */
export const UpdateBadge = () => {
  const state = useUpdateStore((store) => store.state)

  if (!state?.availableVersion) return null

  const visible =
    state.phase === 'available' ||
    state.phase === 'downloading' ||
    state.phase === 'downloaded'

  if (!visible) return null

  return (
    <Link
      to={`${ROUTES.SETTINGS}?section=update`}
      className="sidebar-update-link"
      aria-label="有新版本，前往更新设置"
    >
      <Badge color="green" variant="soft" size="1">
        有新版本
      </Badge>
    </Link>
  )
}
