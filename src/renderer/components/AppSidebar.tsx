import { NavLink, useLocation } from 'react-router'
import { Copy, FileSpreadsheet, ScanLine } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { getAppVersion } from '@/utils/common'

const NAV_ITEMS = [
  {
    label: '图片拷贝',
    description: '扫描 DC 目录并批量拷贝',
    to: '/image-copy',
    icon: Copy,
  },
  {
    label: 'Excel 解析',
    description: '筛选与导出缺陷数据',
    to: '/excel-parse',
    icon: FileSpreadsheet,
  },
]

export const AppSidebar = () => {
  const { pathname } = useLocation()

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <ScanLine className="size-4" />
          </div>
          <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">SHX Tools</span>
            <span className="truncate text-xs text-muted-foreground">
              产线检验工具
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>工具</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.to}
                    tooltip={item.label}
                  >
                    <NavLink to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          <span>版本 {getAppVersion()}</span>
          <span>Windows</span>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
