# 最佳实践：选型、组合、效率、验收

这份文件回答四个问题，按写代码的时间顺序排列：

1. **选型**：这个需求该落到哪个组件？
2. **组合与封装**：怎么拼、什么时候该封一个业务组件？
3. **效率**：同一效果怎么写得更短、更少覆盖？
4. **验收**：写完之后，怎么判断它「好」？

每条 `practice（实践）` 都按四段写：**场景 → 默认选择 → 反例 → 代价**。
没有「代价」的实践会变成教条，没有「反例」的实践无法自检——这两段都不是装饰。

> 依据：官方文档示例 + `@radix-ui/themes@3.3.0` 源码；来自作者验证的条目标 `实测`。
> 机制与边界在 [rules.md](rules.md)，组件拼法在 [components.md](components.md)，界面骨架在 [layout-patterns.md](layout-patterns.md)，症状索引在 [pitfalls.md](pitfalls.md)。

---

## 1. 选型

**先问三句**：库里有现成组件吗？现成组件能组合出来吗？必须自己封吗？
顺序不能跳——跳到第三句就开始手搓，跳到第二句失败就失去一致性。

### 1.1 状态与标签

**场景**：需要一个表示状态的小块文字（进行中、失败、已归档）。
**默认**：

```tsx
<Badge variant="soft" color="green">已完成</Badge>
```

**反例**：`<span className="chip">` + CSS 背景圆角；或用 `Card` 包一个词。
**代价**：`Badge` 的 `color` 只接 26 个强调色族，**没有单阶控制**。要更浅的语义只能回 CSS，这时在代码里写清原因。

### 1.2 一段说明或警告

**场景**：一段需要被看见的说明、注意事项、失败原因。
**默认**：

```tsx
<Callout.Root color="amber" size="1">
  <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
  <Callout.Text>部分机台未响应，结果可能不完整。</Callout.Text>
</Callout.Root>
```

**反例**：`Card` + 手动图标 + 黄色背景；或 `Text color="amber"` 一段话。
**代价**：`Callout` 是三段结构（`Root` / `Icon` / `Text`），比一行 `Text` 重；一句话的小提示用 `Text` 就好。

### 1.3 指标与数字块

**场景**：一屏里的指标卡：大数字 + 单位 + 标签。
**默认**：`Card` 里 `Text size="6"` 放数字、`Text size="1" color="gray"` 放标签。
**反例**：`div` + `font-size: 32px` + 手写背景和圆角。
**代价**：`Card` 的内边距与圆角由 `size` 决定（源码 `--base-card-*`）；要更紧凑只能 `Inset` 或覆盖变量，不能给 `Card` 传 `p`。

### 1.4 布尔与多选

**场景**：开 / 关、勾选、从少量选项里选一个。
**默认**：

| 需求 | 组件 |
|---|---|
| 开 / 关（立即生效） | `Switch` + `Text as="label"` |
| 勾选（提交时生效，可多选） | `Checkbox` / `CheckboxGroup` |
| 少量互斥选项，全部可见 | `RadioGroup` |
| 少量互斥选项，要求视觉突出 | `RadioCards` |
| 少量互斥选项，挤在一行 | `SegmentedControl` |

**反例**：用 `Button` 的选中态模拟单选框；用 `Switch` 表示需要提交的多选。
**代价**：`RadioCards` / `CheckboxCards` 的卡片有最小尺寸与内边距，塞进窄侧栏会溢出；`SegmentedControl.Item` 需要 `value`。

### 1.5 从多个值里选一个

**场景**：下拉选择、筛选器、表单里的枚举字段。
**默认**：选项 ≥ 7 或需要节省空间 → `Select.Root`；选项 ≤ 6 且希望一眼看全 → `RadioGroup` / `SegmentedControl`。
**反例**：把 30 个选项塞进 `RadioGroup`；用原生 `<select>` 配 CSS 覆盖。
**代价**：`Select` **没有内置搜索**。要搜索就只能自封 Combobox（见 [missing-components.md](missing-components.md)），这是引入外部依赖或写交互代码的起点。

### 1.6 页面导航 vs 内容切换

**场景**：顶部一组标签，点击切换内容。
**默认**：切的是**同一页面的内容** → `Tabs`；切的是**不同页面/路由** → `TabNav`。
**反例**：用 `Tabs` 做主导航（官方明说 `Tabs` 不该用于页面导航）；反过来用 `TabNav` 做内容切换，会丢 `Tabs.Content` 的键盘语义。
**代价**：`TabNav` 不带面板，选中态要靠路由的 `active` 维护；`Tabs` 不参与路由，刷新后状态丢失。

### 1.7 没有对应组件时

**场景**：需要一个 Themes 没有的东西（DatePicker、TreeView、Combobox…）。
**默认**：按三级决策走，**从第一级开始试**：

1. **组合**已有组件（`Popover` + `Button` + 自行渲染列表）。
2. **封装**成业务组件（同一组合第二次出现时）。
3. **引入 headless 库**（`react-day-picker`、`cmdk`…），样式全部换成令牌。

**反例**：直接引入 Mantine / Antd / Element（主题体系互不感知）；或为了一个日期选择器自己写日历的键盘交互。
**代价**：每一级都更贵——组合会让使用方多写几行；封装要维护 props 透传；headless 库要自己补齐无障碍与样式。

---

## 2. 组合与封装

### 2.1 组合优于配置

**场景**：一个卡片里要放表格、图片或贴边的操作区。
**默认**：`Card` + `Inset` 组合，而不是给 `Card` 造一堆自定义 props。

```tsx
<Card size="2">
  <Inset side="x"><Table.Root>…</Table.Root></Inset>
</Card>
```

**反例**：`<Card padded={false} flushTable>` 这种自造 API——把库的组合能力重新发明成布尔开关。
**代价**：组合会让 JSX 深一层；当同一个组合出现三次，才值得把它封成组件（见 2.3）。

### 2.2 `asChild` 的时机

**场景**：需要让 Radix 组件的外观/行为挂到一个已有元素上（路由 `Link`、原生 `<a>`、上传用的 `<label>`）。
**默认**：外层组件加 `asChild`，把目标元素作为**唯一子节点**。

```tsx
<Button asChild variant="soft"><Link to="/settings">设置</Link></Button>
```

**反例**：`<Button asChild>保存</Button>`（纯文本子节点会报错）；`<Button asChild>` 包两个子节点。
**代价**：`asChild` 会把 props 合并到子元素上，子元素必须能接住它们；`Dialog.Title`、大部分表单控件的 `Root` 没有 `asChild`（类型已剔除）。

### 2.3 什么时候该封业务组件

**场景**：一组组合在每个页面都出现。
**默认**：满足任一条就封——**同一组合出现 ≥ 3 次**，或**需要承载领域语义**（`<OrderRow>`、`<StatusBadge>`）。
**反例**：出现一次就封；或者封了之后不透传 `...props` / `className` / `ref`。
**代价**：多一层抽象会遮住底层 props。封的时候必须透传，并在组件名上体现领域含义，否则使用方还得回来看源码。

### 2.4 不要写薄包装

**场景**：想给 `Card` 加一个默认 `variant`。
**默认**：直接在使用处写 `<Card variant="surface">`；需要统一改时，用 CSS 或一个常量，而不是包一层组件。
**反例**：`const MyCard = (p) => <Card variant="surface" {...p} />`——没有信息量，还会让类型提示变差。
**代价**：重复写同一个 prop 看起来啰嗦，但比多一层要可读；真正的全集统一应该走主题或样式层。

### 2.5 弹层里的贴边

**场景**：弹窗或卡片里要放一张贴边的表格/图片。
**默认**：`<Inset side="x" my="4">`；要沿用父级内边距用 `p="current"`。
**反例**：给内部元素写负 margin；或把 `Dialog.Content` 的 padding 清零再自己补。
**代价**：`Inset` 只能抵消父容器的内边距，遇到自定义 padding 的容器就不准；`p="current"` 的语义文档没写清（源码支持）。

### 2.6 文字与容器的边界

**场景**：容器里要放一段文字。
**默认**：文字永远在 `Text` / `Heading` 里，容器只负责布局；表单标签用 `<Text as="label">`。
**反例**：`<Flex color="gray">一段说明</Flex>`；`<Box fontSize="12px">`。
**代价**：多包一层会让 JSX 变长；但容器替文字做样式后，多个子节点就无法分别控制颜色与字重。

### 2.7 用 14 个构建块搭界面，CSS 是例外

**场景**：要包一层、要排一行、要放一段文字——任何布局与文本的起点。
**默认**：用 14 个 `building block（构建块）` 搭——布局 5 个（`Box` / `Flex` / `Grid` / `Container` / `Section`），文本 9 个（`Text` / `Heading` / `Link` / `Code` / `Kbd` / `Blockquote` / `Quote` / `Strong` / `Em`）。

**搭不出来才写 CSS**，而且每条新增声明必须能指到三类之一：**令牌表达不了的属性**（`grid-template-columns`、`font-variant-numeric`）、**状态**（`:hover` / `[data-state]`）、**第三方覆盖层**。指不到就删——没有「先写上去，也许有用」。

**原生标签的判据**：**Themes 没提供的，才用原生承担**——`img`、`video`、`audio`、`form`、`ul`、`details`、`input[type=file]` 都属于这类。路由链接需要原生 `<a>` 承担客户端跳转与 `aria-current`，但外壳必须是 `Link asChild` / `Button asChild`——那不是「用原生做布局」。

```tsx
// ❌ 原生标签承担布局与排版
<div className="row"><span>名称</span><span>12 KB</span></div>

// ✅
<Flex gap="3"><Text size="2">名称</Text><Text size="2" color="gray">12 KB</Text></Flex>
```

**反例**：`<div>` 只为加 margin / padding；`<span>` 当标签；`<h3>` 当标题；`<b>` / `<i>` 代替 `Strong` / `Em`；用 `Card` 拼一切（`Card` 是成品部件，不是构建块）。判断标准是**它有没有承担布局或排版职责**——承担了就必须换成组件。
**代价**：多一层组件会加深 DOM（`Flex` 本身就是 `div`）；判断「Themes 有没有」要查一次 [llms.txt](llms.txt) 的组件清单。这一次 grep 换掉的，是「把 `ul` 改成 `Flex`、再改回来」的来回。

---

## 3. 效率与简洁

### 3.1 能用 props 表达的不写 CSS

**场景**：要调方向、间距、尺寸、对齐、换行。
**默认**：全部走 props（`direction` / `gap` / `p` / `width` / `align` / `wrap`）。
**反例**：`.toolbar { display: flex; gap: 8px; }` 与 `<Flex gap="2" className="toolbar">` 同时存在。
**代价**：props 只覆盖布局类属性；`border` / `background` / 伪类 / `grid-template-columns` 仍然必须写 CSS——但那样就不算双写。

### 3.2 只写偏离默认值的 prop

**场景**：想「显式写清楚」，于是把默认值也写上——主题配置和组件 prop 都一样。
**默认**：只写偏离默认值的项：`<Theme appearance="light" grayColor="slate">`；`<Badge>已完成</Badge>`（不写 `size="1"` / `variant="soft"`）。

两类**必须写**的例外：

1. **该 prop 没有默认值**：`Text` 没有默认 `size`，不写等于**继承父级字号**（父级 `size="2"` 就是 14px），不是取默认——所以 `size` 必须写。
2. **值在响应式对象里**：`size={{ md: '3' }}` 中的 `3` 是默认档，但它只在 `md` 生效，删掉就改变行为。

**反例**：`accentColor="indigo"`、`radius="medium"`、`scaling="100%"`；`<Button size="2" variant="solid">`；`<Text as="span">`；`<Heading size="6">`（6 就是默认）。
**代价**：显式写默认值并不「稳定」——它把当前默认值钉进代码；库升级改了默认值，这一行会变成「看起来最明确、实际最不一致」的那份。判据是：删掉它，行为与样式是否不变。

### 3.3 给例外定价

**场景**：不得不写 CSS 覆盖组件。
**默认**：只允许三类——**令牌表达不了的属性**（`grid-template-columns`、`font-variant-numeric`）、**状态**（`:hover` / `[data-state]` / `:has()`）、**第三方覆盖层**（`react-day-picker` 等）。
**反例**：给 `.rt-Button` 改 padding；用 `!important` 绕过顺序问题。
**代价**：例外是长期债——每一条都要写注释说明「为什么 props 做不到」，否则下一个人会把它当成规范抄走。

### 3.4 不加无信息量的抽象

**场景**：想让代码「更整洁」，于是抽出一个包装组件或一个 hook。
**默认**：先用组合与常量；抽象只在**需要承载语义或复用 ≥ 3 次**时才加。
**反例**：`useDialogState` 包一层 `useState`；`<Wrapper>` 只为了加一个 className。
**代价**：抽象会隐藏调用处的真实依赖，并让读代码的人多跳一层。

### 3.5 局部换色用 color，不用嵌套 Theme

**场景**：只想让某个按钮/某个区块换个强调色。
**默认**：组件级 `color="blue"`；整块区域换色才用嵌套 `<Theme accentColor="blue" grayColor="auto">`。
**反例**：为了一个按钮嵌套 `<Theme>`；嵌套时忘了 `grayColor="auto"`，灰阶仍跟随父级。
**代价**：组件级 `color` 只影响该组件；需要「整块区域 + 文本 + 边框」一起变时才轮到 Theme。

### 3.6 状态样式用 data-*，不用自定义 class

**场景**：选中、展开、禁用、加载中的样式。
**默认**：用 `[data-state="open"]` / `[data-disabled]` / `[data-active]`。
**反例**：自己加 `className={open ? 'is-open' : ''}`，再写两套 CSS。
**代价**：`data-*` 是 Radix 内部输出，属性名不会变但**页面不保证全都有**；用之前先在 DevTools 里确认该组件真的输出了这个属性。

---

## 4. 验收

写完一段 UI，按下面五条过一遍。前三条可 grep，后两条要人判断。

### 4.1 结构

```bash
# 写死颜色（有输出就要逐个确认）
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src --include=*.css --include=*.tsx
# CSS 里的字号三件套（有输出就是双写）
grep -rnE '^\s*(font-size|line-height|letter-spacing)\s*:' src --include=*.css
# 间距 prop 多值（会被丢弃）
grep -rnE '\b(p|px|py|pt|pr|pb|pl)="[^"]*[0-9] +[0-9]' src --include=*.tsx
```

判据：三条 grep 的输出都为空，或每一处都有注释说明原因。

### 4.2 无障碍

**默认**：每个可交互元素都有名称——可见文字，或 `aria-label`；图标按钮必须有 `aria-label`（官方措辞是 strongly recommended，本 skill 升格为必须——缺失是静默的可访问性失败）；`Dialog` / `AlertDialog` 必须有 `Title`；纯装饰图标 `aria-hidden`。
**反例**：`<IconButton><XIcon /></IconButton>`；`<Dialog.Content>` 里没有 `Dialog.Title`。
**代价**：给纯图标补名称会增加一行；漏掉的代价是读屏用户听到「button」。

### 4.3 主题联动

**默认**：明暗切换后没有残留的写死颜色；所有颜色来自 `var(--accent-*)` / `var(--gray-*)`，圆角来自 `var(--radius-*)`。
**反例**：`background: #fff`；`border-radius: 6px`。
**代价**：用令牌会失去「精确到像素」的控制——需要精确时用 `calc(var(--space-2) - 1px)` 这类派生写法，而不是写死。

### 4.4 成本

**默认**：删掉本次新增的每一条 CSS 声明，问「删了会不会坏」；不会坏的就是冗余，删掉。
**反例**：为了「看起来一样」保留一段覆盖；`margin: 0` 写在本来就被 reset 的元素上。
**代价**：这条最费时间，也是唯一能阻止 CSS 单调增长的检查。

### 4.5 一致性

**默认**：同一语义在同一页面用同一组件——所有状态都用 `Badge`、所有说明都用 `Callout`、所有数字块都用 `Card`。
**反例**：一处 `Badge`、一处手写 chip；一处 `Callout`、一处 `Card` + 黄底。
**代价**：一致性有时要牺牲「这一处更好看」的局部最优；破例要在注释里写明理由。
