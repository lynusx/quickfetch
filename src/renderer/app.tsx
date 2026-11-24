import { useEffect } from 'react'
import { Theme } from '@radix-ui/themes'

import { Toaster } from '@/components/toaster/toaster'
import {
  selectPreferences,
  useSettingsStore,
} from '@/features/settings/settingsStore'
import { useUpdateBridge } from '@/features/update/useUpdateBridge'
import {
  useApplyDensity,
  useApplyScale,
  useResolvedAppearance,
} from '@/lib/appearance'
import { AppRoutes } from './routes/app-routes'

/**
 * 主题根。只写 Radix 默认值以外的两项：
 * - `appearance`：由设置页「明暗」偏好（跟随系统 / 浅色 / 深色）实时解析。
 * - `grayColor`：默认 `auto` 会随 accentColor 联动换灰阶，这里显式钉 `slate`，
 *   以后改 accentColor 不会顺带把中性色一起换掉。
 *
 * `accentColor="indigo"`、`radius="medium"`、`scaling="100%"` 与默认值逐字相同，不写。
 * 后代组件更不该重复 `radius` / `accentColor` / `scaling` / `appearance`——它们全部继承这里。
 */
function App() {
  const loadSettings = useSettingsStore((state) => state.load)
  const { appearance, density, scale } = useSettingsStore(selectPreferences)
  const resolvedAppearance = useResolvedAppearance(appearance)

  useApplyDensity(density)
  useApplyScale(scale)
  useUpdateBridge()

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  return (
    <Theme appearance={resolvedAppearance} grayColor="slate">
      <AppRoutes />
      <Toaster theme={resolvedAppearance} />
    </Theme>
  )
}

export default App
