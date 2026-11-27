# Radix Themes 使用规则

本文件是 `@radix-ui/themes`（基准 v3.3+）的权威规则与机制说明。日常速查入口见 [SKILL.md](../SKILL.md)；选型与封装判据见 [practices.md](practices.md)；组件拼法见 [components.md](components.md)；症状排障见 [pitfalls.md](pitfalls.md)。

> 碰到「该写 props 还是 CSS」查 §1–2；碰到「档位与断点怎么写」查 §3；碰到「排版与颜色边界」查 §4–5；碰到「叶子组件怎么限宽/伸缩」查 §6.4；碰到「默认 prop 能不能省」查 §7；碰到「某处留 CSS 是否正当」查 §8。

---

## 0. 核心术语

- **`double-write`（双写）**：同一属性在组件 props 与项目 CSS 里各声明一次；两者同为 `0-1-0` 特异性，后加载的项目 CSS 静默吃掉 prop。
- **`silent failure`（静默失败）**：类型检查通过、控制台无报错，但实际渲染结果偏离预期的失效（如双写、`p="2 4"` 归零、缺 `Dialog.Title` 丢读屏名称）。
- **`building block`（构建块）**：14 个基础原子组件——5 个布局容器（`Box` / `Flex` / `Grid` / `Container` / `Section`）+ 9 个排版组件（`Text` / `Heading` / `Link` / `Code` / `Kbd` / `Blockquote` / `Quote` / `Strong` / `Em`）。`Card` / `Badge` / `Table` / `Dialog` 等属于带语义外观的**成品组件**。
- **`hand-rolled component`（手搓组件）**：用裸 HTML 元素 + 手写 CSS 重新实现 `Card`、`Badge`、`ScrollArea`、`Table`、`DataList` 等内置组件。
- **`scale step`（档位）**：Radix 的单个枚举档位 `"0"`–`"9"`，映射固定设计令牌，不是像素值也不是 CSS 多值简写。
- **`token`（令牌）**：由 `<Theme>` 下发的 CSS 变量（如 `var(--gray-a5)`、`var(--space-3)`、`var(--radius-4)`）。
- **`responsive object`（响应式对象）**：以 `initial`（0px 基线，必填）配合 `xs` / `sm` / `md` / `lg` / `xl` 为键的 prop 对象语法（如 `columns={{ initial: '1', md: '3' }}`）。
- **`inherited prop surface`（继承 prop 面）**：Themes 组件从底层 Radix Primitive 透传但未列在 Themes 页面表上的 prop 集合。
- **`prop source`（prop 源）**：Themes 组件文档 API Reference 首句指向的同名 Primitive 文档页（仅查其 API 表，不照搬其无样式手写 CSS 示例）。
- **`leading trim`（行高修剪）**：通过 `trim` prop 消除字体上下天然半行距留白（half-leading），实现文字与图标或容器边缘的像素级对齐。
- **`color-leakage`（颜色泄漏）**：绕过 Typography 的默认色与 `color` / `highContrast` prop，在 CSS 类中手写 11/12 阶或非法 9/10 阶文本颜色。

---

## 1. 样式的五层来源与优先级

| 层 | 来源 | 特异性 | 覆盖关系 |
| --- | --- | --- | --- |
| ① 主题令牌 | `<Theme>` 下发 `--radius-*` / `--accent-*` / `--gray-*` / `--space-*` / `--focus-*` | — | 全局基线，改一处全树联动（见 [theming.md](theming.md)） |
| ② 组件基础样式 | `.rt-*` 组件外观与 reset（特异性封顶 `0-1-0`，部分内部选择器用 `:where()` 归零） | `0-1-0` | 被 ③ ④ 按加载顺序覆盖 |
| ③ prop 工具类 | `gap="2"` 等生成的 `.rt-r-*` | `0-1-0` | 覆盖 ②；与 ④ 同级 |
| ④ 项目自定义 CSS | 在 `@radix-ui/themes/styles.css` 之后加载 | `0-1-0` | 与 ③ 同特异性，**后加载者胜**（双写静默失效的根源） |
| ⑤ 内联 `style` | `style={{ … }}` 与 `--p: …` 等内联自定义属性 | 最高 | 仅用于动态计算值或极少数不转发 `LayoutProps` 的根元素（如 `ScrollArea` 的 `style={{ flexGrow: 1 }}`） |

推论：全站联动改 ①；单处布局/排版优先走 ③；③ 与 ④ 写同一属性必成 bug。

---

## 2. props 与 CSS 的分工

### 2.1 同一属性只写一处

```tsx
// ❌ TSX 写 gap="2"（8px），CSS 又写 gap: 6px → prop 永远不生效
<Grid className="choice-grid" gap="2">
/* .choice-grid { display: grid; gap: 6px; } */

// ✅ 网格列数、模板与区域均由 Grid props 完整表达
<Grid columns="3" gap="2">
<Grid columns="120px minmax(0, 1fr)" gap="2">
<Grid areas='"header header" "nav main"' columns="220px minmax(0, 1fr)" gap="3">
<Grid columns={{ initial: '1', sm: '2', md: '3' }} gap="2">
```

### 2.2 样式定制的三层裁决

1. **Tier 1 — 令牌与原生 Props**：根或局部覆盖公开令牌（`--color-*`、`--radius-*`、`--cursor-*`、`--base-card-*`），传组件原生 props，编写状态伪类（`:hover`、`:focus-visible`、`[data-state]`）。
2. **Tier 2 — As-Is 原样使用**：接受成品组件预设高度、内边距与圆角，靠 `size` / `variant` 与 `asChild` 适配场景，不强改 `.rt-Button` 等内部类。
3. **Tier 3 — 14 构建块自组**：当预设形态与需求冲突时，用 `Box`/`Flex`/`Grid` + Typography + Radix Primitives + 令牌从零拼装，交互语义用 `<Button asChild>` 或 `<Link asChild>` 承载。

### 2.3 正当留在 CSS 的声明

- 视觉成型属性：`border`、`background`、`box-shadow`、`backdrop-filter`、`transition`
- 伪类、属性状态与关系选择器：`:hover`、`:focus-visible`、`[data-state]`、`[data-disabled]`、`:has()`、`.row + .row`
- props 未覆盖的排版/网格细节：`font-variant-numeric: tabular-nums`、`repeat(auto-fill, minmax(...))`
- 组件公开的局部 CSS 变量（如 `--base-card-*`）以及状态驱动的字重变化

> `Grid` 已原生支持 `columns`、`rows`、`areas`、`flow`、`align`、`justify`、`alignContent`、`justifyItems` 及 `gap`/`gapX`/`gapY`；`Table.Root` 支持 `layout="fixed"`，`Table.Cell` / `ColumnHeaderCell` 支持 `width` / `minWidth` / `maxWidth` / `p`，这些均直接走 props。

### 2.4 不转发 `LayoutProps` 的成品组件与 `ScrollArea`

- **`ScrollArea`**：仅接收 `size` / `radius` / `scrollbars` / `type` / `scrollHideDelay` / `dir` / `asChild` 与 `MarginProps`，其余布局 props 会被静默丢弃。撑满父级用外层 `<Box>` / `<Flex>` 或 `style={{ flexGrow: 1 }}`，内边距加在视口内的 `<Box p="3">`。
  - 原生跨平台虚拟滚动条由 props 控制：`size="1"`（默认，4px 紧凑轨道）、`size="2"`（8px 标准轨道）、`size="3"`（12px 宽松轨道）；`type` 支持 `"hover"`（默认）、`"auto"`（溢出常驻）、`"scroll"`、`"always"`；`scrollbars` 支持 `"both"`（默认）、`"vertical"`、`"horizontal"`。直接使用原生 `ScrollArea`，不在 CSS 手写 `::-webkit-scrollbar`。
- **`IconButton` / `Button` / `Badge`**：仅含 `MarginProps`；需要 `flexShrink="0"` 或限宽时外包 `<Box flexShrink="0">`。
- **`Card`**：圆角与内边距由 `size` 决定（内部 `--base-card-*` 变量），局部贴边用 `<Inset>`。

---

## 3. 尺度

间距、字号、行高、圆角、字重、字距只取 Radix 档位与令牌：

| 尺度 | 档位与像素（100% scaling） | Props 写法 | CSS 写法 |
| --- | --- | --- | --- |
| Space | `1`–`9` = 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64px（`0` = 0px） | `gap="3"`、`gapX="2"`、`p="4"`、`mb="2"` | `var(--space-3)` |
| Font size | `1`–`9` = 12 / 14 / 16 / 18 / 20 / 24 / 28 / 35 / 60px | `<Text size="2">` | 由 `size` 派生，不写 CSS |
| Line height | `Text`: 16/20/24/26/28/30/36/40/60px；`Heading`: 16/18/22/24/26/30/36/40/60px | 由 `size` 同步下发 | 由 `size` 派生，不写 CSS |
| Letter spacing | `1`–`9` = `+0.0025em` → `-0.025em` | 由 `size` 同步下发 | 由 `size` 派生，不写 CSS |
| Weight | `light`(300) / `regular`(400) / `medium`(500) / `bold`(700) | `weight="medium"` | 用 `weight` prop |
| Radius | 组件 prop 枚举：`none` / `small` / `medium` / `large` / `full`；CSS 令牌 `1`–`6` = 3/4/6/8/12/16px | `radius="full"` | `var(--radius-4)` |

### 3.1 两档之间取整与几何尺寸边界

- 旧样式落在两档正中间（6 / 10 / 14 / 20 / 28px）时：`gap` / `margin` **向上取**，`padding` **向下取**。
- 侧边栏宽、弹窗最大宽、图标框宽高属于几何约束，直接写原值（如 `maxWidth="480px"`、`width="40px"`）；圆形用 `border-radius: 50%`，胶囊用 `radius="full"` 或 `var(--radius-full)`。

### 3.3 间距 prop 不接多值简写

`p="2 4"` 会输出 `style="--p: 2 4"`，浏览器解析 `padding: 2 4` 因缺单位整条丢弃，结果静默变成 `padding: 0`。多值必须拆成方向 prop（`py="2" px="4"`、`pt="2" pb="1" px="3"`），或传带单位的合法 CSS 值（`p="8px 16px"`）。

### 3.4 响应式 prop 与六档断点

支持响应式的 prop 接收断点对象，键名全集为 6 档：`initial`（0px）、`xs`（520px）、`sm`（768px）、`md`（1024px）、`lg`（1280px）、`xl`（1640px）。

```tsx
// ✅ 始终以 initial 作为移动端/默认基线
<Grid columns={{ initial: '1', sm: '2', md: '3' }} gap={{ initial: '2', md: '4' }} />
<Box display={{ initial: 'none', md: 'block' }} />
```

不写 `base`（Radix 不识别该键名，会导致基线丢失），也不混写响应式工具类名。像素细节见 [theming.md §4.1](theming.md#41-breakpoints-六档断点体系)。

---

## 4. Typography 排版能力

9 个排版构建块（`Text` / `Heading` / `Link` / `Code` / `Kbd` / `Blockquote` / `Quote` / `Strong` / `Em`）完整承载文字排版：

### 4.1 `size` 同步绑定三件套

`size` 通过 `.rt-r-size-N` 同时设置 `font-size`、`--line-height` 与 `--letter-spacing`。组件上只传 `size` 与 `weight`，不在项目 CSS 中重复声明字号、行高或字距。

### 4.2 等宽文本使用 `<Code>` / `<Kbd>`

路径、命令、哈希、编号需要等宽字体时，直接使用内置绑定 `--code-font-family` 的构建块，不在容器或 `Text` 的 CSS 类上手写 `font-family: var(--code-font-family)`：
- 纯文本无底色等宽：`<Code size="1" variant="ghost" color="gray" truncate>{path}</Code>`
- 徽标式代码片段：`<Code size="1" variant="soft">` 或 `variant="outline"`
- 键盘快捷键：`<Kbd size="1">`（默认 `variant="classic"`，3.3+ 支持柔和外观 `variant="soft"`）

### 4.3 文本对齐使用 `align` prop

`Text`、`Heading`、`Blockquote` 原生支持响应式 `align="left" | "center" | "right"`，直接用 prop 替代 CSS `text-align`。

### 4.4 行高修剪（`trim`）与折行（`wrap`）

- `trim="normal" | "start" | "end" | "both"`：消除首尾半行距留白（支持 `Text`、`Heading`、`Blockquote`、`DataList.Root`），用于图标与文字或卡片顶边的紧凑对齐。
- `wrap="wrap" | "nowrap" | "pretty" | "balance"`：段落防孤字用 `pretty`，多行标题匀称折行用 `balance`。

### 4.5 `Heading` 与 `Text` 的行高差异

同 `size` 下 `Heading` 在 `2`–`5` 档行高比 `Text` 紧 2px（`--heading-line-height-*`）；且 `Heading` 的语义标签 `as="h1"–"h6"` 与视觉档位 `size` 完全解耦（如 `<Heading as="h2" size="3">`）。

### 4.6 唯一允许在 CSS 写字号的例外

第三方无头组件内部自行生成的 DOM（如 `react-day-picker` 的 `.rdp-*`）无法接收 Radix `Text` prop，可在对应覆盖层 CSS 中引用 `var(--font-size-*)` 并加注释（及 `stylelint-disable-next-line` 理由）豁免。

---

## 5. 颜色

### 5.1 可读文本的 11/12 阶规范

按 Radix Colors 设计规范，**12 阶（主要高对比文本）与 11 阶（次级可读文本）是唯二满足阅读对比度的文本阶梯**；9/10 阶用于实心按钮/徽标背景及非文本图形：

| 文本层级 | 实现方式 | 说明 |
| --- | --- | --- |
| 主要正文 / 标题（12 阶） | 默认继承根 `.radix-themes` 的 `var(--gray-12)`，或彩色文本配 `highContrast` | 无需传 `color`，更不在 CSS 写 `color: var(--gray-12)` |
| 次级说明 / 辅助标签（11 阶） | `<Text size="1" color="gray">` 或具名色 `color="indigo"` | 彩色 `Text` 默认渲染 `--{color}-a11`（alpha 混色更柔和，属官方设计） |
| 进一步弱化视觉权重 | 组合 `size="1"` + `color="gray"` + `weight="regular"`（或 `light`） | 保持 WCAG AA 可读对比度，不向阅读文本赋 9/10 阶色 |

### 5.2 容器上允许设置 `color` 的三种情形

1. 为 SVG 图标上色（如提示图标、空状态装饰图标用 `var(--gray-9)` / `var(--accent-11)`）；
2. 为非文字几何图形（状态圆点、指示线）上色；
3. **随祖先伪类/状态联动的文字色**（如导航项 `:hover` / `[aria-current="page"]` 改变内部文字颜色——静态 `color` prop 无法响应祖先伪类）。

静态语气映射（如 `default | success | warning | danger`）直接在 TSX 中用映射对象转成 `color` prop，不绕道自定义 `data-tone` + CSS。

---

## 6. 布局组件的分工

### 6.1 文字包进 Typography，容器单职责组合

文字不裸放在 `Box`/`Flex`/`Grid` 下；同时需要布局与卡片外观时，由 `Card` / `Box` 管外观、`Flex` / `Grid` 管排布、`Text` / `Heading` 管文字。

### 6.2 原生 HTML 标签的保留范围

仅在 Radix Themes 无对应组件或语义必需时使用原生标签：`form`、`img`、`video`、`audio`、`ul`/`li`、`details`/`summary`、`input[type="file"]`、包裹隐藏 input 的 `<label>`，以及经 `<Button asChild>` / `<Link asChild>` 组合的路由 `<a>`。`Box` 的 `as` 仅支持 `"div" | "span"`；分区 `<section>` 语义用 `<Section>`。

### 6.4 几何尺寸与弹性包裹

仅 **5 个布局容器**（`Box`、`Flex`、`Grid`、`Container`、`Section`）实现了 `LayoutProps`（`p*`、`width`/`minWidth`/`maxWidth`、`height`/`minHeight`/`maxHeight`、`position`/`inset`/`top`/`right`/`bottom`/`left`、`overflow`/`overflowX`/`overflowY`、`flexGrow`/`flexShrink`/`flexBasis`、`alignSelf`/`justifySelf`、`gridArea`/`gridColumn*`/`gridRow*`）。

非布局组件（`Text`、`Slider`、`Button`、`Badge`、`ScrollArea` 等）需要尺寸约束或弹性分配时，一律用 `<Box>` 或 `<Flex>` 显式包裹并通过 props 声明：

```tsx
// 弹性滑杆 + 定宽数值列
<Flex align="center" gap="4">
  <Box flexGrow="1" flexShrink="1" flexBasis="0" minWidth="0">
    <Slider value={[val]} onValueChange={([v]) => setVal(v)} />
  </Box>
  <Box flexShrink="0" minWidth="32px">
    <Text size="2" weight="medium" align="right" className="tabular">{val}</Text>
  </Box>
</Flex>

// Flex 行内长路径截断 + 尾部不压缩徽标
<Flex align="center" gap="2">
  <Box flexGrow="1" minWidth="0">
    <Code size="1" variant="ghost" color="gray" truncate>{path}</Code>
  </Box>
  <Box flexShrink="0"><Badge color="blue">{status}</Badge></Box>
</Flex>
```

---

## 7. 不写组件自带的默认值

省略与组件源码默认值相同的 prop，避免局部钉死并减少噪音（源码核实于 `@radix-ui/themes@3.3.0`）：

| 组件 | 源码默认变体 | 源码默认尺寸 | 其他源码默认值 | 书写要点 |
| --- | --- | --- | --- | --- |
| `<Theme>` | — | — | `appearance="inherit"`, `accentColor="indigo"`, `grayColor="auto"`, `radius="medium"`, `scaling="100%"`, `panelBackground="translucent"`, `hasBackground={true}` | 根节点只写偏离项（如固定浅色写 `appearance="light"`，钉死中性灰写 `grayColor="slate"`） |
| `<Text>` | `as="span"` | **无默认值** | 继承 `var(--gray-12)` | **`size` 必须显式传**；主正文不写 `color` |
| `<Heading>` | `as="h1"` | `size="6"` | `weight="bold"` | 按文档大纲传 `as="h2"` 等，偏离 6 时传 `size` |
| `<Code>` | `variant="soft"` | 随上下文或显式传 | 绑定 `--code-font-family` | 纯文本等宽显式传 `variant="ghost"` |
| `<Kbd>` | `variant="classic"` | 随上下文或显式传 | 3.3+ 可选 `variant="soft"` | classic 不必重复写 |
| `<Badge>` | `variant="soft"` | `size="1"` | 跟随 `accentColor` | 省掉 `variant="soft"` 与 `size="1"` |
| `<Button>` / `<IconButton>` | `variant="solid"` | `size="2"` | `loading={false}` | 主按钮直接 `<Button>`；`IconButton` 必传 `aria-label` |
| `<Card>` | `variant="surface"` | `size="1"` | 圆角 `--radius-4` | 省掉 `variant="surface"` 与 `size="1"` |
| `<Callout.Root>` | `variant="soft"` | `size="2"` | 跟随 `accentColor` | 省掉 `variant="soft"` 与 `size="2"` |
| `<Dialog.Content>` | — | `size="3"` | `align="center"`, `maxWidth="600px"` | 偏离 600px 时才传 `maxWidth` |
| `<TextField.Root>` | `variant="surface"` | `size="2"` | 单体渲染包装层与 `<input>` | 省掉 `variant="surface"` 与 `size="2"` |
| `<Select.Root>` / `<Select.Content>` | `position="item-aligned"` | `size="2"` | — | 常规朝下展开菜单需显式传 `<Select.Content position="popper">` |
| `<Table.Root>` | `variant="ghost"` | `size="2"` | `layout="auto"` | 需要外框底色时传 `variant="surface"` |
| `<DataList.Root>` | — | `size="2"` | `orientation="horizontal"` | 水平排布且 size 2 时无需传 |
| `<ScrollArea>` | — | `size="1"` | `type="hover"`, `scrollbars="both"` | 常驻自动显隐需显式传 `type="auto"`；主视口加粗传 `size="2"` |
| `<Separator>` | — | `size="1"` | `orientation="horizontal"`, `color="gray"` | 水平短线无需传默认项；通栏传 `size="4"` |
| `<Switch>` / `<Checkbox>` | `variant="surface"` | `size="2"` | 跟随 `accentColor` | 省掉 `variant="surface"` 与 `size="2"` |
| `<Spinner>` / `<Skeleton>` | — | `Spinner`: `size="2"` | `loading={true}` | 常驻加载态不必传 `loading={true}`；动态切换传 `loading={busy}` |
| `<Flex>` / `<Grid>` | `as="div"` | — | `Flex`: `direction="row"`；`Grid`: `display="grid"` | 省掉默认 `as="div"`、`direction="row"`、`display="grid"` |

**两类必须显式声明的情形**：① `<Text>` 无默认 `size`，必须显式写；② 响应式对象中即使某档等于默认值也必须写全（如 `size={{ initial: '1', md: '2' }}` 中的 `initial`）。

---

## 8. 例外与决策

### 8.1 合法留 CSS 的通用判据

每条合法的 CSS 例外都能指明**哪个 DOM 拿不到 prop、或哪个能力不在 prop 面内**，并在代码旁附简短注释说明原因：

| 合法例外形态 | 原因 |
| --- | --- |
| 第三方无头组件生成的内部 DOM（如 `react-day-picker` `.rdp-*`、`sonner`） | 内部节点不暴露为 Radix 组件，只能消费令牌覆盖 |
| 原生输入控件值需等宽字体（如展示文件路径的 `TextField.Root` 内部 `input`） | `TextField` 无等宽变体 prop，需对内部 `input` 指定 `var(--code-font-family)` |
| 随祖先 `:hover` / `[aria-current]` 变化的文字或图标颜色 | Typography 的 `color` 是静态 prop，无法感知祖先伪类 |
| 给 SVG 图标或状态几何图形上色 | 不属于 Typography 文本节点 |
| 路由链接 `<a>` 或文件选择 `<label>` 保留原生宿主 | 维持客户端导航、`aria-current` 或避免 `<label>` 内嵌套 `<button>` |
| `ScrollArea` 内部 `.rt-ScrollAreaViewport` 设置 `scroll-padding-top` | `ScrollArea` 无对应 prop，键盘焦点避让吸顶页头需设在滚动视口上 |
| 局部 `isolation: isolate` 容器内的吸顶头部 `z-index` | 限制在局部层叠上下文内压住滚动正文，不影响全局 Portal 弹层 |

宿主项目若有自身确认的业务例外，应集中记录在宿主项目的 `AGENTS.md` 中。

### 8.2 统一白卡底座与控件尺寸账

- 若全站面板需要零内边距自定义分区的卡片底座，统一在 `<Card>`（默认 `surface`）上挂单一共享类，仅归零 `--base-card-padding-*` 并覆盖 `--card-background-color` / `--base-card-surface-box-shadow`，圆角交由 `Card` 的 `size` 自动派生（`surface` 描边为 `::after` inset ring，不占盒模型宽高）。
- 替换原生小元素前先核对档位下限：`Button` 四档高约 `24 / 32 / 40 / 48px`，`Badge` 最小字号 `12px`。若元素本身只是 `<label>` 内的紧凑视觉提示，改用构建块 + 令牌比强改 `Button` 更干净。

---

## 9. 不要重写主题已经分发的值

判据只有一条：**删掉该条声明后，`getComputedStyle` 计算值是否完全不变**——不变即为冗余（如 `.rt-Text` 上写 `margin: 0` 或 `color: var(--gray-12)`、根节点写 `accentColor="indigo"`）。

主题级圆角、缩放、光标与焦点环的详细规则见 [theming.md §3–4、§9](theming.md#3-radius六档到底是多少像素)。

---

## 10. `Text` 的盒子边界

- **`Text` 原生支持全部 `MarginProps`**（`m` / `mx` / `my` / `mt` / `mr` / `mb` / `ml`），兄弟间距优先用父容器 `gap`，单元素外边距直接传 `mb="2"`，不必为了留空包一层 `Box`。
- **只有两类情况需要给 `Text` 外包容器**：
  1. 需要背景、描边、圆角与内边距（它本质是徽标/面板盒子，用 `Box`/`Flex` 承载 `p` 与外观）；
  2. 作为 Flex/Grid 子项需要收缩截断或弹性占位（外包 `<Box minWidth="0" flexGrow="1">`，内部 `<Text truncate>`）。
- 块级文本直接传 `<Text as="div">` 或 `<Text as="p">`（替代 CSS `display: block`），单行省略直接传 `truncate`（替代手写省略三件套）。
