import { NavLink } from 'react-router'
import {
  CameraIcon,
  CopyIcon,
  GearIcon,
  MagnifyingGlassIcon,
  TableIcon,
  TargetIcon,
} from '@radix-ui/react-icons'
import { Box, Flex, ScrollArea, Text } from '@radix-ui/themes'
import { SCAN_CATEGORY_LABEL } from '@shared/scanCategories'

import { BrandMark } from '@/components/brand-mark/brand-mark'
import { UpdateBadge } from '@/features/update'
import { useAppVersion } from '@/hooks/useAppVersion'
import { ROUTES } from '@/routes/paths'
import './app-sidebar.css'

const NAV_GROUPS = [
  {
    label: '找图',
    items: [
      {
        label: SCAN_CATEGORY_LABEL.el,
        to: ROUTES.EL,
        icon: CopyIcon,
      },
      {
        label: SCAN_CATEGORY_LABEL.aoi,
        to: ROUTES.AOI,
        icon: CameraIcon,
      },
      {
        label: SCAN_CATEGORY_LABEL.lxt,
        to: ROUTES.LXT_EL,
        icon: MagnifyingGlassIcon,
      },
      {
        label: SCAN_CATEGORY_LABEL.pl,
        to: ROUTES.LP_PL,
        icon: TargetIcon,
      },
    ],
  },
  {
    label: '数据',
    items: [
      {
        label: 'Excel 解析',
        to: ROUTES.EXCEL_PARSE,
        icon: TableIcon,
      },
    ],
  },
]

export const AppSidebar = () => {
  const version = useAppVersion()

  return (
    <Flex
      direction="column"
      flexShrink="0"
      flexBasis="var(--app-sidebar-width)"
      width="var(--app-sidebar-width)"
      height="100%"
    >
      <Flex
        className="sidebar-brand"
        align="center"
        gap="3"
        pt="3"
        px="4"
        pb="4"
      >
        <BrandMark />
        <Text as="div" size="3" weight="bold">
          秒取
        </Text>
      </Flex>

      <ScrollArea
        className="sidebar-scroll"
        type="auto"
        scrollbars="vertical"
        role="navigation"
        aria-label="主导航"
      >
        <Box px="3" pt="1" pb="4">
          {NAV_GROUPS.map((group) => (
            <Box className="nav-group" key={group.label}>
              <Text
                as="div"
                size="1"
                weight="medium"
                mx="2"
                mb="2"
                className="nav-group-label"
              >
                {group.label}
              </Text>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} className="nav-item">
                  <Flex
                    className="nav-icon"
                    align="center"
                    justify="center"
                    width="28px"
                    height="28px"
                    flexShrink="0"
                  >
                    <item.icon width={15} height={15} />
                  </Flex>
                  <Text size="2" weight="medium" className="nav-text nav-label">
                    {item.label}
                  </Text>
                </NavLink>
              ))}
            </Box>
          ))}
        </Box>
      </ScrollArea>

      <Box className="sidebar-footer" p="3">
        <NavLink to={ROUTES.SETTINGS} className="nav-item">
          <Flex
            className="nav-icon"
            align="center"
            justify="center"
            width="28px"
            height="28px"
            flexShrink="0"
          >
            <GearIcon width={15} height={15} />
          </Flex>
          <Text size="2" weight="medium" className="nav-text nav-label">
            设置
          </Text>
        </NavLink>

        <Flex align="center" justify="between" gap="2" pt="2" pb="1" px="2">
          <Flex as="span" display="inline-flex" align="center" gap="1">
            <Box as="span" className="status-dot" data-tone="success" />
            <Text size="1" color="gray">
              本地运行
            </Text>
          </Flex>
          <Flex as="span" align="center" gap="2">
            <UpdateBadge />
            <Text size="1" color="gray" className="tabular">
              v{version ?? '…'}
            </Text>
          </Flex>
        </Flex>
      </Box>
    </Flex>
  )
}
