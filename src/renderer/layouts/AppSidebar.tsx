import { NavLink } from 'react-router'
import {
  CopyIcon,
  GearIcon,
  MagnifyingGlassIcon,
  TableIcon,
  TargetIcon,
} from '@radix-ui/react-icons'
import { Box, Flex, Text } from '@radix-ui/themes'

import { BrandMark } from '@/components/BrandMark'
import { ROUTES } from '@/routes/paths'
import { getAppVersion } from '@/utils/common'
import './AppSidebar.css'

const NAV_GROUPS = [
  {
    label: '找图',
    items: [
      {
        label: 'EL',
        to: ROUTES.EL,
        icon: CopyIcon,
      },
      {
        label: '力禧特',
        to: ROUTES.LXT_EL,
        icon: MagnifyingGlassIcon,
      },
      {
        label: '利珀',
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

export const AppSidebar = () => (
  <Flex className="app-sidebar" direction="column">
    <Flex className="sidebar-brand" align="center">
      <BrandMark />
      <Box>
        <Text as="div" className="brand-name">
          SHX Tools
        </Text>
        <Text as="div" className="brand-sub">
          产线检验工作台
        </Text>
      </Box>
    </Flex>

    <Box className="sidebar-nav" role="navigation" aria-label="主导航">
      {NAV_GROUPS.map((group) => (
        <Box className="nav-group" key={group.label}>
          <Text as="div" className="nav-group-label">
            {group.label}
          </Text>
          {group.items.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-item">
              <Flex className="nav-icon" align="center" justify="center">
                <item.icon width={15} height={15} />
              </Flex>
              <Box as="span" className="nav-text">
                <Text as="span" className="nav-label">
                  {item.label}
                </Text>
              </Box>
            </NavLink>
          ))}
        </Box>
      ))}
    </Box>

    <Box className="sidebar-footer">
      <NavLink to={ROUTES.SETTINGS} className="nav-item">
        <Flex className="nav-icon" align="center" justify="center">
          <GearIcon width={15} height={15} />
        </Flex>
        <Box as="span" className="nav-text">
          <Text as="span" className="nav-label">
            设置
          </Text>
        </Box>
      </NavLink>

      <Flex className="sidebar-meta" align="center" justify="between" gap="2">
        <Flex as="span" className="sidebar-status" align="center" gap="1">
          <Box as="span" className="status-dot" data-tone="success" />
          <Text as="span" size="1" color="gray">
            本地运行
          </Text>
        </Flex>
        <Text as="span" size="1" color="gray" className="tabular">
          v{getAppVersion()}
        </Text>
      </Flex>
    </Box>
  </Flex>
)
