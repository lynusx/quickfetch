import { NavLink } from 'react-router'
import { Camera, Copy, Crosshair, Search, Settings, Table2 } from 'lucide-react'
import { Box, Flex, Text } from '@radix-ui/themes'
import { SCAN_CATEGORY_LABEL } from '@shared/scanCategories'

import { BrandMark } from '@/components/brand-mark/brand-mark'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/sidebar'
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
        icon: Copy,
      },
      {
        label: SCAN_CATEGORY_LABEL.aoi,
        to: ROUTES.AOI,
        icon: Camera,
      },
      {
        label: SCAN_CATEGORY_LABEL.lxt,
        to: ROUTES.LXT_EL,
        icon: Search,
      },
      {
        label: SCAN_CATEGORY_LABEL.pl,
        to: ROUTES.LP_PL,
        icon: Crosshair,
      },
    ],
  },
  {
    label: '数据',
    items: [
      {
        label: 'Excel 解析',
        to: ROUTES.EXCEL_PARSE,
        icon: Table2,
      },
    ],
  },
]

export const AppSidebar = () => {
  const version = useAppVersion()
  const { open } = useSidebar()

  return (
    <Sidebar>
      <SidebarHeader>
        {open ? (
          <Flex align="center" gap="3" pl="1" minWidth="0">
            <BrandMark />
            <Text as="div" size="3" weight="bold" truncate>
              秒取
            </Text>
          </Flex>
        ) : (
          <Box mx="auto">
            <SidebarTrigger />
          </Box>
        )}
        {open ? <SidebarTrigger /> : null}
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton tooltip={item.label}>
                    <NavLink
                      to={item.to}
                      className="nav-item"
                      data-collapsed={!open || undefined}
                    >
                      <Flex
                        className="nav-icon"
                        align="center"
                        justify="center"
                        width="28px"
                        height="28px"
                        flexShrink="0"
                      >
                        <item.icon size={15} strokeWidth={1.75} />
                      </Flex>
                      {open ? (
                        <Box minWidth="0">
                          <Text size="2" weight="medium" className="nav-label">
                            {item.label}
                          </Text>
                        </Box>
                      ) : null}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenuButton tooltip="设置">
          <NavLink
            to={ROUTES.SETTINGS}
            className="nav-item"
            data-collapsed={!open || undefined}
          >
            <Flex
              className="nav-icon"
              align="center"
              justify="center"
              width="28px"
              height="28px"
              flexShrink="0"
            >
              <Settings size={15} strokeWidth={1.75} />
            </Flex>
            {open ? (
              <Box minWidth="0">
                <Text size="2" weight="medium" className="nav-label">
                  设置
                </Text>
              </Box>
            ) : null}
          </NavLink>
        </SidebarMenuButton>

        {open ? (
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
        ) : null}
      </SidebarFooter>
    </Sidebar>
  )
}
