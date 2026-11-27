# 缺失组件的处理方案

`@radix-ui/themes` 未内置 DatePicker、Drawer、Sidebar、Combobox、TreeView、Carousel、Toast、复杂虚拟化 DataTable 等高阶业务组件；另有部分组件仅存在于无样式的 Radix Primitives（如 `Accordion`、`Collapsible`、`Form`、`Label`、`Menubar`、`OneTimePasswordField`、`PasswordToggleField`、`Toast`、`Toggle`、`Toolbar`）。

处理缺失组件的核心底线是**绝不引入自带独立主题体系的重型 UI 库（如 Ant Design、MUI、Mantine）或混入 Tailwind CSS**，确保全应用始终受唯一根 `<Theme>` 控制。

---

## 1. 先查内置轻量平替（零外部依赖）

| 未单独封装的组件 | `@radix-ui/themes` 内置平替 | 说明 |
| --- | --- | --- |
| `Label` | `<Text as="label">` | 原生支持排版 props 与 `htmlFor`；`RadioGroup.Item` / `CheckboxGroup.Item` 含文本时自动包 label |
| `Toggle` / `ToggleGroup` | `Switch` 或 `SegmentedControl` | 布尔开关用 `Switch`；多值切换直接用 `SegmentedControl` |
| `Toolbar` | `Flex` + `Button` / `IconButton` + `Separator` | 构建块直接组合即可 |
| `PasswordToggleField` | `TextField.Root` + `TextField.Slot` | 右侧 `Slot` 放入切换 `type` 的 `IconButton` |

---

## 2. 复杂缺失组件的两种并列一等方案

根据组件形态从以下两种无冲突方案中择优采用（也可组合使用）：

| 方案 | 适用组件举例 | 做法与优劣 |
| --- | --- | --- |
| **方案 A：移植组合式无头 API（参考 `shadcn/ui` 结构 + Radix 令牌）** | `Drawer`（侧滑抽屉，基于 `Dialog` primitive）、`Sidebar`（可折叠导航骨架）、`Empty`（结构化空态）、`Collapsible` / `Accordion` | 复用业界成熟的组合式子组件 API 契约与 Radix Primitives 无障碍行为，彻底剥离 Tailwind 类名，改由 Radix 构建块（`Flex`/`Box`/`Text`）+ 设计令牌实现样式，与宿主组件库无缝融为一体 |
| **方案 B：引入专注单一领域的 Headless 库 + 令牌覆盖层** | `DatePicker`（`react-day-picker`）、`Combobox`（`cmdk`）、`Toast`（`sonner`）、`Carousel`（`embla-carousel-react`）、`DataTable`（`@tanstack/react-table` + Themes `Table`） | 免去手写日历键盘网格、模糊搜索或手势物理引擎的高昂成本；外壳用 Themes 组件（如 `Popover` + `Button`），内部 DOM 用极薄的令牌 CSS 覆盖 |

---

## 3. 令牌一致性三件套（自定义/覆盖层必守）

无论采用方案 A 还是方案 B，新增组件的 CSS 满足以下三条即可自动跟随 `<Theme>` 的明暗模式、主题色与圆角档位切换：

1. **颜色**：只引用 `var(--accent-*)`、`var(--gray-*)`、`var(--color-panel-solid)`，不写硬编码色值；
2. **字体**：使用 `var(--default-font-family)`（代码类用 `var(--code-font-family)`）；
3. **圆角与阴影**：引用 `var(--radius-1)`~`var(--radius-4)` 与 `var(--shadow-1)`~`var(--shadow-6)`。

---

## 4. DatePicker 最小参考实现（`Popover` + `react-day-picker`）

```tsx
import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { Button, Popover } from '@radix-ui/themes'
import { format } from 'date-fns'
import 'react-day-picker/style.css'
import './date-picker.css'

export function DatePicker() {
  const [date, setDate] = useState<Date>()

  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button variant="soft" color="gray">
          {date ? format(date, 'yyyy-MM-dd') : '选择日期'}
        </Button>
      </Popover.Trigger>
      <Popover.Content width="auto">
        <DayPicker mode="single" selected={date} onSelect={setDate} />
      </Popover.Content>
    </Popover.Root>
  )
}
```

```css
/* date-picker.css —— 第三方无头 DOM 消费 Radix 令牌 */
.rdp-root {
  --rdp-accent-color: var(--accent-9);
  --rdp-accent-background-color: var(--accent-3);
  --rdp-day-height: 32px;
  --rdp-day-width: 32px;
  --rdp-day_button-border-radius: var(--radius-2);
  --rdp-selected-border: none;
  --rdp-today-color: var(--accent-11);
  font-family: var(--default-font-family);
  color: var(--gray-12);
}

.rdp-day_button:hover {
  background: var(--gray-a3);
}
```
