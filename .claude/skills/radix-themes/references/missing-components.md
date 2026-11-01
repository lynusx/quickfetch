# 缺失组件的处理方案

Themes 未提供 Date Picker、TreeView、Carousel、Combobox、DataTable 等复杂组件。按以下优先级处理：

## 优先级

1. **首选**：引入无样式底层库（如 Date Picker 用 `react-day-picker`）+ Radix 令牌覆盖层。
2. **可参考**：借鉴 shadcn/ui 的组件结构，但必须拆除其 Tailwind 依赖，所有样式替换为 Radix 令牌。
3. **禁止**：引入 Mantine、Antd、Element 等自带主题体系的库——它们的主题与 `<Theme>` 互不感知，暗色模式会失效。

## 一致性三件套（覆盖样式必须遵守）

满足以下三条后，新组件自动跟随 `<Theme>` 的主题色与明暗切换：

1. **颜色**：只用 `var(--accent-*)`、`var(--gray-*)` 令牌，禁止手写 hex
2. **字体**：`font-family: var(--default-font-family)`
3. **圆角**：`var(--radius-1)` ~ `var(--radius-4)`

## 方案对比

| 方案 | 一致性 | 工作量 | 评价 |
|---|---|---|---|
| react-day-picker + Radix 令牌 | 高 | 中 | 推荐，干净可控 |
| shadcn/ui 源码改造 | 中 | 高 | 需拆 Tailwind、逐个替换变量 |
| React Aria 无样式组件 | 高 | 高 | 行为/无障碍最强，样式全自写 |
| Mantine / Antd 组件 | 低 | 低 | 禁止，主题体系冲突 |

## Date Picker 参考实现

```bash
npm install react-day-picker date-fns
```

```tsx
// date-picker.tsx
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { Popover, Button } from "@radix-ui/themes";
import { CalendarIcon } from "@radix-ui/react-icons";
import { format } from "date-fns";
import "react-day-picker/style.css";
import "./date-picker.css"; // 令牌覆盖层

export function DatePicker() {
  const [date, setDate] = useState<Date>();

  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button variant="soft" color="gray">
          <CalendarIcon />
          {date ? format(date, "yyyy-MM-dd") : "选择日期"}
        </Button>
      </Popover.Trigger>
      <Popover.Content>
        <DayPicker mode="single" selected={date} onSelect={setDate} />
      </Popover.Content>
    </Popover.Root>
  );
}
```

```css
/* date-picker.css —— 用 Radix 令牌覆盖 react-day-picker 默认样式 */
.rdp-root {
  --rdp-accent-color: var(--accent-9);            /* 选中色 = 主题强调色 */
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
  background: var(--gray-3);
}
```

## 其他缺失组件选型建议

| 组件 | 推荐底层库 | 外壳 |
|---|---|---|
| Date Picker | `react-day-picker` | Themes `Popover` + `Button` |
| Combobox / 搜索选择 | `cmdk` | Themes `Popover` + `TextField` |
| Carousel | `embla-carousel-react` | Themes `IconButton` 做翻页 |
| Toast | Themes 自带？否 → `sonner`（用令牌覆盖样式） | — |
| DataTable | `@tanstack/react-table`（无样式） | Themes `Table` 组件渲染 |
| TreeView | `@headless-tree/react` 或自研 | Themes 令牌 |

选型原则：底层库必须是**无样式（headless）**的，样式职责全部交给 Radix 令牌。
