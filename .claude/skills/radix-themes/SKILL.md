---
name: radix-themes
description: 使用 Radix Themes（@radix-ui/themes）构建 React UI 的项目规范与专家指南。当用户要求用 Radix Themes / @radix-ui/themes 生成页面、组件、表单、弹层，或需要主题配置、明暗切换、补全 Themes 缺失组件（Date Picker、TreeView 等）时使用。禁止混用 shadcn/ui、MUI、Ant Design、Tailwind。
---

# Radix Themes 使用规范

本项目的 UI 组件库统一使用 **Radix Themes**（`@radix-ui/themes` v3.x）。生成任何 UI 代码前必须遵守本规范。

> 样式归属（哪些写 props、哪些必须留 CSS）以仓库根目录 `AGENTS.md` 原则 3 为准，本文件不重复。

## 核心红线（生成代码时不得出现）

1. ❌ 引入 shadcn/ui、MUI、Ant Design、Mantine 等其他组件库
2. ❌ 引入 Tailwind preflight / CSS reset 全局样式（会破坏 Themes 基线）
3. ❌ 用 `style={{ }}` 内联样式或 `!important` 覆盖 Themes 样式
4. ❌ 手写 hex 颜色值——统一用令牌 `var(--accent-9)`、`var(--gray-3)` 等
5. ❌ 引入 `@radix-ui/react-*` 单独原语包与 Themes 混用（Themes 未提供的组件除外，见 references/missing-components.md）
6. ❌ 自研 Button、Dialog、Select 等 Themes 已有组件
7. ❌ 提交包含 `<ThemePanel />` 的代码
8. ❌ 手写 `dark:` 类名做主题切换——用 `<Theme appearance>` 控制

## 接入 Checklist（新建入口文件必须检查）

- [ ] 已安装 `@radix-ui/themes`（需图标再装 `@radix-ui/react-icons`）
- [ ] 入口文件顶部引入：`import "@radix-ui/themes/styles.css";`
- [ ] 应用根节点用 `<Theme>` 包裹，且**只有一个** `<Theme>`（不嵌套）
- [ ] 组件统一从包根导入：`import { Button } from "@radix-ui/themes";`

## 标准模板

```tsx
import "@radix-ui/themes/styles.css";
import { Theme } from "@radix-ui/themes";

export default function App() {
  return (
    <Theme
      appearance="light"      // 或 "dark" / "inherit"
      accentColor="indigo"    // 项目主题色，改动需团队确认
      grayColor="slate"
      radius="medium"
      scaling="100%"
    >
      <YourApp />
    </Theme>
  );
}
```

## 组件速查

| 需求 | 组件 |
|---|---|
| 布局 | `Flex` / `Grid` / `Box` / `Container` / `Section`（间距用 `gap`/`p`/`m`，值 `"1"`~`"9"`） |
| 排版 | `Text` / `Heading` / `Code` / `Em` / `Strong`（样式用 `size`/`weight`/`color` props） |
| 按钮 | `Button`（主操作 `variant="solid"`，次操作 `soft`/`outline`，弱操作 `ghost`）、`IconButton` |
| 表单 | `TextField.Root` / `Select.Root` / `Checkbox` / `RadioGroup.Root` / `Switch` |
| 弹层 | `Dialog.Root` / `AlertDialog.Root` / `Popover` / `DropdownMenu.Root` / `Tooltip` |
| 尺寸 | 统一用 `size="1" ~ "4"`，同一上下文内保持一致 |

详细组件规范见 [references/components.md](references/components.md)；主题配置与明暗切换见 [references/theming.md](references/theming.md)。

## Themes 缺失组件（Date Picker / TreeView / Carousel 等）

**禁止**为补全组件而引入 Mantine、Antd 等自带主题体系的库。正确做法：引入无样式底层库（如 Date Picker 用 `react-day-picker`）+ 用 Radix 令牌写覆盖层，保证自动跟随 `<Theme>` 的主题色与明暗切换。

完整方案与代码示例见 [references/missing-components.md](references/missing-components.md)。

## 参考文档

生成代码前如不确定组件或 prop 是否存在，先查文档，不要臆造 API：

- 组件总览：https://www.radix-ui.com/themes/docs/overview/getting-started
- 主题配置：https://www.radix-ui.com/themes/docs/theme/overview
- 设计令牌：https://www.radix-ui.com/themes/docs/theme/token-reference
