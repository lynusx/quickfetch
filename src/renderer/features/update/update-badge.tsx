import { Link as RouterLink } from 'react-router'
import { Badge, Flex, Link } from '@radix-ui/themes'

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
    <Flex asChild display="inline-flex">
      <Link asChild underline="none">
        <RouterLink
          to={`${ROUTES.SETTINGS}?section=update`}
          aria-label="有新版本，前往更新设置"
        >
          <Badge color="green">有新版本</Badge>
        </RouterLink>
      </Link>
    </Flex>
  )
}
