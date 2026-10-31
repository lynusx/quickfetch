import { NavLink, useLocation } from 'react-router'
import {
  Copy,
  FileSpreadsheet,
  FolderSearch,
  ScanLine,
  Settings,
} from 'lucide-react'

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

/**
 * 侧边栏菜单。
 *
 * 「一键找图」下按扫描类别分两项：EL 与力禧特的路径来源、机台构成、
 * 所在网络都完全不同，各自是独立页面，任务状态互不干扰。
 * 分组只用一个静态小标题，不做折叠 —— 为藏两个入口多点一次不值，
 * 折叠成图标模式时标题自动隐藏，两个图标并排显示。
 */
const NAV_GROUPS = [
  {
    label: '一键找图',
    items: [
      {
        label: 'EL',
        description: '扫描 DC 共享盘并批量拷贝',
        to: '/image-copy',
        icon: Copy,
      },
      {
        label: '力禧特',
        description: '按快捷方式识别机台并扫描',
        to: '/lxt',
        icon: FolderSearch,
      },
    ],
  },
  {
    label: '数据',
    items: [
      {
        label: 'Excel 解析',
        description: '筛选与导出缺陷数据',
        to: '/excel-parse',
        icon: FileSpreadsheet,
      },
    ],
  },
]

const SETTINGS_PATH = '/settings'

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
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
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
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname === SETTINGS_PATH}
              tooltip="设置"
            >
              <NavLink to={SETTINGS_PATH}>
                <Settings />
                <span>设置</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          <span>版本 {getAppVersion()}</span>
          <span>Windows</span>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
