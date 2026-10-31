import { NavLink, useLocation } from 'react-router'
import {
  CopyIcon,
  DashboardIcon,
  GearIcon,
  MagnifyingGlassIcon,
  TableIcon,
  TargetIcon,
} from '@radix-ui/react-icons'
import { Box, Flex, Text, Heading, Button, Separator } from '@radix-ui/themes'
import { getAppVersion } from '@/utils/common'

const NAV_GROUPS = [
  {
    label: '一键找图',
    items: [
      {
        label: 'EL',
        description: '扫描 DC 共享盘并批量拷贝',
        to: '/image-copy',
        icon: CopyIcon,
      },
      {
        label: '力禧特',
        description: '按快捷方式识别机台并扫描',
        to: '/lxt',
        icon: MagnifyingGlassIcon,
      },
      {
        label: '利珀',
        description: '按快捷方式识别机台并扫描',
        to: '/pl',
        icon: TargetIcon,
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
        icon: TableIcon,
      },
    ],
  },
]

const SETTINGS_PATH = '/settings'

export const AppSidebar = () => {
  const { pathname } = useLocation()

  return (
    <Flex
      direction="column"
      justify="between"
      style={{
        width: 240,
        minWidth: 240,
        height: '100vh',
        backgroundColor: 'var(--gray-2)',
        borderRight: '1px solid var(--gray-6)',
        padding: 'var(--space-3)',
      }}
    >
      <Flex direction="column" gap="4">
        {/* Header */}
        <Flex align="center" gap="2" px="2" py="1">
          <Flex
            align="center"
            justify="center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-3)',
              backgroundColor: 'var(--accent-9)',
              color: 'var(--accent-contrast)',
            }}
          >
            <DashboardIcon width={18} height={18} />
          </Flex>
          <Box>
            <Heading size="3" weight="bold" style={{ lineHeight: 1.2 }}>
              SHX Tools
            </Heading>
            <Text size="1" color="gray">
              产线检验工具
            </Text>
          </Box>
        </Flex>

        <Separator size="4" />

        {/* Groups */}
        <Flex direction="column" gap="3">
          {NAV_GROUPS.map((group) => (
            <Flex direction="column" gap="1" key={group.label}>
              <Box px="2" py="1">
                <Text size="1" weight="medium" color="gray">
                  {group.label}
                </Text>
              </Box>
              {group.items.map((item) => {
                const isActive = pathname === item.to
                return (
                  <Button
                    key={item.to}
                    asChild
                    variant={isActive ? 'soft' : 'ghost'}
                    color={isActive ? 'indigo' : 'gray'}
                    size="3"
                    style={{
                      justifyContent: 'flex-start',
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    <NavLink to={item.to}>
                      <item.icon width={16} height={16} />
                      <Text size="2" weight={isActive ? 'bold' : 'regular'}>
                        {item.label}
                      </Text>
                    </NavLink>
                  </Button>
                )
              })}
            </Flex>
          ))}
        </Flex>
      </Flex>

      {/* Footer */}
      <Flex direction="column" gap="2">
        <Separator size="4" />
        <Button
          asChild
          variant={pathname === SETTINGS_PATH ? 'soft' : 'ghost'}
          color={pathname === SETTINGS_PATH ? 'indigo' : 'gray'}
          size="3"
          style={{
            justifyContent: 'flex-start',
            width: '100%',
            textAlign: 'left',
          }}
        >
          <NavLink to={SETTINGS_PATH}>
            <GearIcon width={16} height={16} />
            <Text
              size="2"
              weight={pathname === SETTINGS_PATH ? 'bold' : 'regular'}
            >
              设置
            </Text>
          </NavLink>
        </Button>
        <Flex justify="between" px="2" py="1">
          <Text size="1" color="gray">
            版本 {getAppVersion()}
          </Text>
          <Text size="1" color="gray">
            Windows
          </Text>
        </Flex>
      </Flex>
    </Flex>
  )
}
