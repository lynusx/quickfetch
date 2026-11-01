# 主题配置与明暗切换

## Theme 配置项

| 属性 | 可选值 | 默认值 | 说明 |
|---|---|---|---|
| `appearance` | `light` / `dark` / `inherit` | `inherit` | 明暗模式 |
| `accentColor` | indigo、crimson、cyan、orange 等 30 色 | `indigo` | 主题强调色 |
| `grayColor` | gray、mauve、slate、sage、olive、sand | `gray` | 灰阶风格 |
| `radius` | none / small / medium / large / full | `medium` | 全局圆角 |
| `scaling` | 90% / 95% / 100% / 105% / 110% | `100%` | 全局缩放 |
| `panelBackground` | solid / translucent | `translucent` | 面板背景 |

开发调试时可临时加入 `<ThemePanel />` 可视化调整主题，**提交代码前必须移除**。

## 明暗切换

用状态控制 `appearance`，禁止手写 `dark:` 类名或两套 CSS：

```tsx
import { useState } from "react";
import { Theme, IconButton } from "@radix-ui/themes";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";

export default function App() {
  const [appearance, setAppearance] = useState<"light" | "dark">("light");

  return (
    <Theme appearance={appearance} accentColor="indigo">
      <IconButton
        variant="ghost"
        onClick={() => setAppearance(a => (a === "light" ? "dark" : "light"))}
      >
        {appearance === "light" ? <MoonIcon /> : <SunIcon />}
      </IconButton>
      {/* 应用内容 */}
    </Theme>
  );
}
```

## 设计令牌（CSS 变量）

`<Theme>` 会自动生成以下变量，自定义样式时只允许使用这些令牌，禁止手写 hex：

| 类别 | 变量示例 | 用途 |
|---|---|---|
| 强调色 | `--accent-1` ~ `--accent-12` | 1=背景、3=hover 背景、9=实心色、11=弱对比文字、12=高对比文字 |
| 灰阶 | `--gray-1` ~ `--gray-12` | 语义同上，用于中性元素 |
| 圆角 | `--radius-1` ~ `--radius-4` | 组件圆角 |
| 字体 | `--default-font-family`、`--code-font-family` | 正文字体、代码字体 |
| 间距 | `--space-1` ~ `--space-9` | 内外边距 |

常用语义速记：

```css
background: var(--gray-1);      /* 页面背景 */
background: var(--gray-3);      /* 元素 hover 背景 */
color: var(--gray-12);          /* 主要文字 */
color: var(--gray-11);          /* 次要文字 */
background: var(--accent-9);    /* 主题色实心背景 */
color: var(--accent-11);        /* 主题色文字 */
```

## 局部主题覆盖

需要某块区域使用不同配色时，用嵌套的 `<Theme>` 组件局部覆盖（这是允许的，但全局根 Theme 仍只能有一个）：

```tsx
<Theme accentColor="crimson" asChild>
  <Card>这块区域的组件使用 crimson 主题色</Card>
</Theme>
```

完整令牌参考：https://www.radix-ui.com/themes/docs/theme/token-reference
