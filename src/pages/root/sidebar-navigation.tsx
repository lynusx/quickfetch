import { type FC } from 'react'
import { Box } from '@radix-ui/themes'

const SiderbarNavigation: FC = () => {
  return (
    <Box
      width="280px"
      height="100vh"
      pt="6"
      px="5"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    ></Box>
  )
}

export default SiderbarNavigation
