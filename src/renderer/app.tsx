import { Theme } from '@radix-ui/themes'

import { Toaster } from '@/components/toaster/toaster'
import { useUpdateBridge } from '@/features/update/useUpdateBridge'
import { AppRoutes } from './routes/app-routes'

/**
 * 主题根。只写 Radix 默认值以外的两项：
 * - `appearance`：默认 `inherit` 会跟随系统深浅色，本产品只做浅色，必须钉死。
 * - `grayColor`：默认 `auto` 会随 accentColor 联动换灰阶，这里显式钉 `slate`，
 *   以后改 accentColor 不会顺带把中性色一起换掉。
 *
 * `accentColor="indigo"`、`radius="medium"`、`scaling="100%"` 与默认值逐字相同，不写。
 * 后代组件更不该重复 `radius` / `accentColor` / `scaling` / `appearance`——它们全部继承这里。
 */
function App() {
  useUpdateBridge()

  return (
    <Theme appearance="light" grayColor="slate">
      <AppRoutes />
      <Toaster />
    </Theme>
  )
}

export default App
