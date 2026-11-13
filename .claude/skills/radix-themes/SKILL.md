---
name: radix-themes
description: 使用 Radix Themes（@radix-ui/themes）构建 React UI 的项目规范与专家指南。当用户要求用 Radix Themes / @radix-ui/themes 生成页面、组件、表单、弹层，或需要主题配置、明暗切换、补全 Themes 缺失组件（Date Picker、TreeView 等）时使用。也用于判断某条样式该写 props 还是 CSS、某个值是否合规、某处留 CSS 是否有正当理由。禁止混用 shadcn/ui、MUI、Ant Design、Tailwind。
---

# Radix Themes 使用规范

本项目的 UI 组件库统一使用 **Radix Themes**（`@radix-ui/themes` v3.x）。生成或修改任何 UI 代码前必须遵守本规范。

> 规则全文（机制、尺度表、例外清单、决策理由）在 [references/rules.md](references/rules.md)。
> 本文件是干活时照着走的路径，不重复其中的论据。

## 核心红线（生成代码时不得出现）

1. ❌ 引入 shadcn/ui、MUI、Ant Design、Mantine 等其他组件库
2. ❌ 引入 Tailwind preflight / CSS reset 全局样式（会破坏 Themes 基线）
3. ❌ 用 `style={{ }}` 内联样式或 `!important` 覆盖 Themes 样式
4. ❌ 手写 hex 颜色值——统一用令牌 `var(--accent-9)`、`var(--gray-3)` 等
5. ❌ 引入 `@radix-ui/react-*` 单独原语包与 Themes 混用（Themes 未提供的组件除外，见 [references/missing-components.md](references/missing-components.md)）
6. ❌ 自研 Button、Dialog、Select 等 Themes 已有组件——重点是这几类高频误造：**Card**（面板/设置卡，别再写 `background+border+border-radius+box-shadow`）、**Badge**（状态徽标，别手写三色 span）、**ScrollArea**（可滚动列表，别写 `overflow-y: auto`）、**Table**（数据行，别用 Grid 手搓表头）、**Separator**（分隔线）
7. ❌ 提交包含 `<ThemePanel />` 的代码
8. ❌ 手写 `dark:` 类名做主题切换——用 `<Theme appearance>` 控制

## 三条分工原则

1. **props 优先，CSS 兜底。** 间距、尺寸、对齐、flex 比例、overflow 一律走 props；CSS 只留 props 表达不了的部分（边框、背景、伪类、后代选择器、`[data-state]`）。同一属性写两处时，项目 CSS 后加载会**静默吃掉 prop**。
2. **分工靠组件，不靠 class。** `Flex` 管方向与间距，`Box` 管背景与描边，`Text` / `Heading` 管文字。文字不能是布局组件的直接子节点；反过来，`Text` 也不承担盒子的职责——需要内边距或背景时，说明缺的是一个容器。
3. **字号、颜色、间距都从组件 prop 走。** `size` 是字号三件套的唯一来源，`color` 是颜色的事，档位只取 Radix 尺度。

每条为什么这么定、边界在哪，见 [references/rules.md](references/rules.md) 第 1、5、9 节。

## 改已有 UI 代码前的自查清单

动现成组件（尤其是 `Field` / `Panel` / `EmptyState` / `Stat` / `ChoiceList` 这类被全页引用的基元）时，逐条过一遍。每条都是一个触发词，命中就去 rules.md 对应小节看判据。

- [ ] **有没有双写**：tsx 里写了 `gap` / `p` / `align`，同名 CSS 又写了一遍？（rules §1）
- [ ] **文字有没有塞进布局组件**：`<Flex>一段话</Flex>`、`<Box>标签</Box>` → 里面套 `<Text>`。（§5.1）
- [ ] **容器是不是在替文字做样式**：`color` / `font-*` / `text-align` 下沉到内部 `Text`；只有 svg 上色、图形上色、随祖先状态变化的字色三种例外。（§4）
- [ ] **一个 class 是不是干了太多事**：出现裸 `display` / `flex-*` / `align-items` / `justify-content` / `gap` / `padding` 就是违规——判据是**有没有裸布局声明**，不是声明条数。（§5.2）
- [ ] **`Text` 是不是在当盒子用**：CSS 给 `Text` 加了 `padding` / `border` / `background`？先看有没有可见边界——无背景/描边时 `m*` prop 与 padding 视觉等价，直接换掉；有边界才包 `Box`。另外 `Text` **有** margin（官方支持 common margin props），只是没有 padding；块级用 `as="div"`、截断用 `truncate`，不要写 `display: block` 或截断三件套。（§9）
- [ ] **有没有手写字号三件套**：CSS 里有 `font-size` / `line-height` / `letter-spacing` 就错，字重走 `weight`。（§3）
- [ ] **有没有写组件自带的默认值**：`Heading as="h1"` / `size="6"`、`Text as="span"`、`Badge size="1"`、`Button size="2"` / `variant="solid"`、`Flex as="div"` / `display="flex"` / `direction="row"` 都是噪音。**`size` 例外**，它是字号来源，必须显式。（§6）
- [ ] **有没有重写主题已分发的值**：根节点写了 `accentColor` / `radius` / `scaling`？标题上写了 `margin: 0` 或 `color: var(--gray-12)`？卡片覆盖了 `--base-card-border-radius`？判据是「删掉这条声明，`getComputedStyle` 是否一模一样」，一样就是冗余。（§8）
- [ ] **间距 prop 有没有多值简写**：`p="2 4"` / `p="6 4"` / `p="2 2 1"` 会静默变成 **padding: 0**，必须拆 `py` / `px` / `pt` / `pb`。（§2.3）
- [ ] **有没有自定值**：`gap="11px"`、`pt="12px"`、`border-radius: 9px`、`font-weight: 600` 都要落到档位；固定尺寸（`width` / `height` / `maxWidth`）不受此限。（§2）
- [ ] **有没有裸元素**：新增的 `<div>` / `<span>` / `<p>` / `<h1>`–`<h6>` 是否真有必要？布局换 `Box` / `Flex` / `Grid`，排版换 `Text` / `Heading`。（§5.3）
- [ ] **有没有重造组件**：要写的外观是否已有现成组件（Card / Badge / ScrollArea / Table / Separator / Callout / Progress）？
- [ ] **卡片有没有重写外观**：白卡用 `Card variant="surface"` + `.app-card`，不再声明覆盖变量或手写 `background` / `border` / `box-shadow`。（§7.2）
- [ ] **换控件前量过尺寸吗**：`Button` 只有 24 / 32 / 40 高，`Badge` 最小字号 12px。档位对不上时覆盖成本常高于收益。（§7.3）
- [ ] **有没有多余嵌套**：`Flex > Box > Flex` 只为对齐的，能否合并一层？
- [ ] **只关布局的 class 是否已经空了**：规则删空后连同 class 名与 `import './x.css'` 一起清理。

清单只覆盖已知的坑；按现象找改法最快的地方是 [references/anti-patterns.md](references/anti-patterns.md)（双写、裸元素、重造组件、原生滚动、文字错层、颜色留容器、间距简写、`Text` 当盒子）。

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
    // 只写默认值以外的 prop；accentColor / radius / scaling /
    // panelBackground 全部交给默认，后代组件更不该重复
    <Theme appearance="light" grayColor="slate">
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
- Type scale：https://www.radix-ui.com/themes/docs/theme/typography#type-scale
