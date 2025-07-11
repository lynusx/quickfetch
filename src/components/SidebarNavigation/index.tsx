import React, { useState, type FC } from 'react'
import { Box, Flex, Text, IconButton, TextField } from '@radix-ui/themes'
import { NavLink, useLocation } from 'react-router'
import {
  DashboardIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
  CopyIcon,
  FileTextIcon,
} from '@radix-ui/react-icons'

import { getAppVersion } from '../../utils/common'
import './index.css'

const SiderbarNavigation: FC = () => {
  const location = useLocation()
  const [darkMode, setDarkMode] = useState(false)

  const navItems = [
    {
      label: '图片拷贝',
      icon: <CopyIcon />,
      path: '/image-copy',
      description: '快速复制图片',
    },
    {
      label: 'Excel 解析',
      icon: <FileTextIcon />,
      path: '/excel-parse',
      description: '解析 Excel 文件',
    },
  ]

  const isActive = (path: string) => location.pathname === path

  return (
    <Box
      width="280px"
      minWidth="280px"
      height="100vh"
      pt="4"
      px="3"
      className="sidebar-container"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* 顶部品牌标识和切换按钮 */}
      <Flex justify="between" align="center" mb="5">
        <Flex align="center" gap="3">
          <Box className="brand-icon">
            <DashboardIcon color="white" width="20" height="20" />
          </Box>
          <Box>
            <Text size="5" weight="bold" style={{ color: 'var(--gray-12)' }}>
              SHX Tools
            </Text>
            {/* <Text size="2" style={{ color: 'var(--gray-10)' }}>
              开发工具集
            </Text> */}
          </Box>
        </Flex>

        <IconButton
          variant="soft"
          radius="full"
          className="theme-toggle"
          onClick={() => setDarkMode(!darkMode)}
          size="2"
        >
          {darkMode ? <SunIcon /> : <MoonIcon />}
        </IconButton>
      </Flex>

      {/* 搜索框 */}
      <Box mb="5">
        <TextField.Root
          radius="large"
          placeholder="搜索工具..."
          className="search-input"
          size="2"
        >
          <TextField.Slot>
            <MagnifyingGlassIcon />
          </TextField.Slot>
        </TextField.Root>
      </Box>

      {/* 导航标题 */}
      <Text size="2" weight="medium" mb="2" style={{ color: 'var(--gray-11)' }}>
        工具列表
      </Text>

      {/* 导航选项 - 使用简单的 div 结构替代 NavigationMenu */}
      <Box className="navigation-root">
        <Box className="navigation-list">
          {navItems.map((item) => (
            <Box key={item.path} className="navigation-item">
              <NavLink to={item.path} className="nav-link">
                <Box
                  p="3"
                  style={{
                    backgroundColor: isActive(item.path)
                      ? 'var(--accent-3)'
                      : 'transparent',
                    borderRadius: '8px',
                    position: 'relative',
                    zIndex: 1,
                  }}
                  className={isActive(item.path) ? 'nav-active' : ''}
                >
                  <Flex align="center" gap="3">
                    <Box
                      className="nav-icon"
                      style={{
                        color: isActive(item.path)
                          ? 'var(--accent-11)'
                          : 'var(--gray-11)',
                        minWidth: '20px',
                      }}
                    >
                      {React.cloneElement(item.icon, { width: 20, height: 20 })}
                    </Box>
                    <Box flexGrow="1">
                      <Text
                        size="3"
                        weight={isActive(item.path) ? 'medium' : 'regular'}
                        style={{
                          color: isActive(item.path)
                            ? 'var(--accent-12)'
                            : 'var(--gray-12)',
                          display: 'block',
                          lineHeight: '1.4',
                        }}
                      >
                        {item.label}
                      </Text>
                      <Text
                        size="1"
                        style={{
                          color: isActive(item.path)
                            ? 'var(--accent-10)'
                            : 'var(--gray-10)',
                          display: 'block',
                          marginTop: '2px',
                        }}
                      >
                        {item.description}
                      </Text>
                    </Box>
                  </Flex>
                </Box>
              </NavLink>
            </Box>
          ))}
        </Box>
      </Box>

      {/* 底部信息 */}
      <Box mt="auto" pt="4" style={{ borderTop: '1px solid var(--gray-6)' }}>
        <Text size="1" style={{ color: 'var(--gray-10)' }}>
          版本 {getAppVersion()}
        </Text>
      </Box>
    </Box>
  )
}

export default SiderbarNavigation
