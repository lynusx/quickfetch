# 组件组合

`@radix-ui/themes` 的组件分四种 API 形态，拼错了不会在编译期报错，只在运行时或无障碍层面出事。这份文件回答：**这个组件怎么拼、缺什么会坏、什么时候用 `asChild`。**

## 目录

1. [先看清 API 形态](#1-先看清-api-形态)
2. [点号子组件的必填项](#2-点号子组件的必填项)：**缺了会怎样**，官方只有子组件树
3. [asChild 的适用范围与限制](#3-aschild-的适用范围与限制)
4. [表单：受控与非受控](#4-表单受控与非受控)
5. [按钮与操作层级](#5-按钮与操作层级)
6. [卡片与 Inset](#6-卡片与-inset)
7. [表格](#7-表格)
8. [文本类与字号继承](#8-文本类与字号继承)
9. [反馈与提示](#9-反馈与提示)
10. [状态样式用哪些属性](#10-状态样式用哪些属性)
11. [继承 prop 面](#11-继承-prop-面)：**Themes 的 prop 表不是全集**

## 这份文件只写官方没写的

逐组件的 prop 表是官方 API Reference 的来源，这里**不重复**：查某个 prop 的类型、默认值、合法取值，去 [llms.txt](llms.txt) 找到该组件页读 `.md`，或直接读 `node_modules` 里的 `.props.tsx`。

这份文件写三样官方不写的东西：

- **缺了会怎样**——哪些子组件是事实必需，不写会丢无障碍名称还是直接报错
- **静默失败**——`ScrollArea` 不接 `flexGrow`、`p="2 4"` 变 0 这类不报错的错法
- **文档与源码不一致**——`appearance` 默认值、`panelBackground` 的作用范围

---

## 1. 先看清 API 形态

| 形态 | 组件 | 拼法 |
|---|---|---|
| **单一组件** | `Box` `Flex` `Grid` `Section` `Container` `Card` `Inset` `Badge` `Button` `IconButton` `Avatar` `Code` `Kbd` `Quote` `Blockquote` `Strong` `Em` `Link` `Text` `Heading` `Skeleton` `Spinner` `Switch` `Checkbox` `Slider` `Radio` `TextArea` `Progress` `ScrollArea` `Separator` `AspectRatio` `VisuallyHidden` `AccessibleIcon` `Reset` `Theme` | 直接写 |
| **点号子组件** | `Dialog` `AlertDialog` `Popover` `DropdownMenu` `ContextMenu` `HoverCard` `Select` `Tabs` `TabNav` `Table` `TextField` `RadioGroup` `CheckboxGroup` `SegmentedControl` `DataList` `Callout` | 按结构拼，缺件会坏 |
| **卡片式集合** | `CheckboxCards` `RadioCards` | `Root` + `Item` |
| **工具件** | `Tooltip`（`content` 是 prop，**没有**子组件）、`Reset`、`Slot`、`Portal`、`useThemeContext` | 特殊用法 |

> **不确定组件是否存在时，不要臆造 API**：在 [llms.txt](llms.txt) 里搜名字，或读本地 `node_modules/@radix-ui/themes/src/components/<kebab>.props.tsx`。

---

## 2. 点号子组件的必填项

> 官方页：17 个组件各有一页，含完整子组件树，见 [llms.txt](llms.txt) 的 Themes / 组件区。
> 表中列的是「这个组件新增的 prop」；组件还继承底层 primitive 的 prop，见 [§11](#11-继承-prop-面)。

「必需」= 缺了会坏（渲染错 / 报错 / 无名称）；「建议」= 只影响体验。

| 组件 | 子部件 | 必需 | 缺了会怎样 |
|---|---|---|---|
| `Dialog` | `Root` `Trigger` `Content` `Title` `Description` `Close` | `Content`；**`Title` 事实必需** | 无 Title 时 `aria-labelledby` 为空 → 读屏只念「dialog」 |
| `AlertDialog` | 同上 + `Action` `Cancel` | `Content` `Title` `Action` `Cancel` | 官方只写「`Cancel` 包住关闭控件」；用普通 `Button` 自行关闭会绕过它的语义 |
| `Popover` | `Root` `Trigger` `Content` `Close` `Anchor` | `Content`；`Trigger` 或 `Anchor` | 没有触发器也没有锚点 → 无定位基准 |
| `DropdownMenu` | `Root` `Trigger` `Content` `Label` `Item` `Group` `RadioGroup` `RadioItem` `CheckboxItem` `Sub` `SubTrigger` `SubContent` `Separator` | `Content` `Item` | — |
| `ContextMenu` | 同 `DropdownMenu`（无 `TriggerIcon`） | `Content` `Item` | — |
| `HoverCard` | `Root` `Trigger` `Content` | 三者 | — |
| `Tooltip` | **无子组件** | `content` prop 必填 | — |
| `Select` | `Root` `Trigger` `Content` `Item` `Group` `Label` `Separator` | 前四者 | `Group` 配 `Label` 才有自动标注 |
| `Tabs` | `Root` `List` `Trigger` `Content` | `List` `Trigger` `Content` | — |
| `TabNav` | `Root` `Link`（`active` prop） | 两者 | **页面级导航用 `TabNav`，不要用 `Tabs`** |
| `Table` | `Root` `Header` `Body` `Row` `Cell` `ColumnHeaderCell` `RowHeaderCell` | `Root` `Body` `Row` `Cell` | — |
| `TextField` | `Root`（`div` 容器）、`Slot` | `Root` | `Root` 内部才渲染 `<input>`；它本身不是 input |
| `RadioGroup` | `Root` `Item` | 两者 | Item 有 children 时自动包 `<label>` |
| `CheckboxGroup` | `Root` `Item` | 两者 | — |
| `SegmentedControl` | `Root` `Item`（`value` 必填） | 两者 | — |
| `DataList` | `Root`(`<dl>`) `Item`(`<div>`) `Label`(`<dt>`) `Value`(`<dd>`) | 四者 | — |
| `Callout` | `Root` `Icon` `Text` | `Root`；`Text` 事实必需 | Callout 的重心是「一段说明」，文字裸放会丢排版 |

### 2.1 破坏性确认的完整拼法

```tsx
import { AlertDialog, Button, Flex } from '@radix-ui/themes'

<AlertDialog.Root>
  <AlertDialog.Trigger>
    <Button color="red">删除</Button>
  </AlertDialog.Trigger>
  <AlertDialog.Content maxWidth="450px">
    <AlertDialog.Title>删除这 3 个文件？</AlertDialog.Title>
    <AlertDialog.Description size="2">
      删除后无法恢复，进度不可撤销。
    </AlertDialog.Description>
    <Flex gap="3" mt="4" justify="end">
      <AlertDialog.Cancel>
        <Button variant="soft" color="gray">取消</Button>
      </AlertDialog.Cancel>
      <AlertDialog.Action>
        <Button variant="solid" color="red">删除</Button>
      </AlertDialog.Action>
    </Flex>
  </AlertDialog.Content>
</AlertDialog.Root>
```

### 2.2 不想要描述文字时

```tsx
<Dialog.Content aria-describedby={undefined}>
  <Dialog.Title>标题</Dialog.Title>
</Dialog.Content>
```

**不要**给 `Dialog.Title` 加 `asChild`——它的类型显式剔除了 `asChild`。要视觉上隐藏标题，用 `<VisuallyHidden>` 包住，而不是 `display: none`。

---

## 3. asChild 的适用范围与限制

> 官方页：https://www.radix-ui.com/primitives/docs/guides/composition.md

**有 `asChild`**：所有布局组件、`Card`、`Inset`、`Badge`、`Button`、`IconButton`、`Text`、`Heading`、`Strong`、`Em`、`Code`、`Kbd`、`Quote`、`Blockquote`、`Link`、`Callout.Root`、`Avatar`、`ScrollArea`、`Theme`、`Dialog.Content` / `AlertDialog.Content` / `Popover.Content` / `HoverCard.Content`、`Tabs.Root` / `Tabs.Content`。

`DropdownMenu` / `ContextMenu` 的 `Content` 文档未列 `asChild`，不要假定有。

**没有 `asChild`**：`Dialog.Title`、`Dialog.Description`、`Table.*`、`Separator`、`Progress`、大部分表单控件的 `Root`。

**限制**：

```tsx
// ❌ 两个子节点：运行时抛错 Slot failed to slot onto its children
<Tooltip content="…"><Button>a</Button><Button>b</Button></Tooltip>

// ❌ 纯文本子节点
<Button asChild>保存</Button>
```

**常见正确用法**：

```tsx
// 路由链接套按钮外观
<Button asChild variant="soft">
  <Link to="/settings">设置</Link>
</Button>

// 按钮包链接：不想要链接样式
<Tooltip content="回到首页">
  <IconButton asChild variant="ghost" aria-label="回到首页">
    <a href="/"><HomeIcon /></a>
  </IconButton>
</Tooltip>
```

---

## 4. 表单：受控与非受控

> 官方页：[TextField](https://www.radix-ui.com/themes/docs/components/text-field.md)、[Select](https://www.radix-ui.com/themes/docs/components/select.md)、[CheckboxGroup](https://www.radix-ui.com/themes/docs/components/checkbox-group.md)、[Switch](https://www.radix-ui.com/themes/docs/components/switch.md)

```tsx
// ✅ 受控：受控值配 onChange
<TextField.Root value={query} onChange={(e) => setQuery(e.target.value)} />
<Select.Root value={mode} onValueChange={setMode}>…</Select.Root>

// ✅ 非受控 + 原生表单提交：靠 name
<TextField.Root name="keyword" defaultValue="" />
<Checkbox name="overwrite" defaultChecked />
```

**三条官方没说的**：

- **`value` 与 `defaultValue` 不要混用**，两个都给会触发「组件从受控变非受控」的警告；`name` 只对原生 `FormData` 提交有效，与受控状态无关。
- `RadioGroup.Item` 有 children 时**自动包 `<label>`**，不需要自己写关联。
- `Checkbox` 是单个组件（**没有**点号 API），`CheckboxGroup` 才是 `Root` + `Item`。

---

## 5. 按钮与操作层级

> 官方页：[Button](https://www.radix-ui.com/themes/docs/components/button.md)、[IconButton](https://www.radix-ui.com/themes/docs/components/icon-button.md)

| 变体 | 语义 | 用在哪 |
|---|---|---|
| `solid` | 主要动作 | 一屏一个（一个表单 / 一个弹窗 / 一个面板头部） |
| `classic` | 经典实心（带阴影） | 与 `solid` 的差别主要在阴影；新界面一般不用 |
| `soft` | 次要动作 | 取消、重置、辅助操作 |
| `surface` | 带描边的按钮 | 与卡片同底色时想要边界感 |
| `outline` | 描边 + 透明底 | 与背景同色、需要明确边界 |
| `ghost` | 无背景 | 工具栏、图标按钮、行内操作 |

- `size` 四档 `"1"`–`"4"`，渲染高度约 24 / 32 / 40 / 48（源码）。要更小的按钮，覆盖成本通常高于收益。
- `IconButton` 不接布局 props（`flexShrink` 要写 CSS）；除尺寸与变体外还接 `color` / `radius` / `highContrast` / `loading` / `asChild`。
- 图标按钮**强烈建议**给 `aria-label`（没有可见文字时它是唯一名称）；纯装饰图标要 `aria-hidden`。
- 按钮里放图标：图标尺寸跟 `Button size` 走，不要自己写 `width`；确需控制时用 `IconButton` 或显式给 `width` / `height`。

---

## 6. 卡片与 Inset

> 官方页：[Card](https://www.radix-ui.com/themes/docs/components/card.md)、[Inset](https://www.radix-ui.com/themes/docs/components/inset.md)

```tsx
<Card variant="surface" size="2">…</Card>
<Card size="2"><Inset side="x" my="2"><Table.Root>…</Table.Root></Inset></Card>
```

**四条官方没说的**：

- 内边距与圆角由 `size` 决定（源码 `--base-card-padding-*` / `--base-card-border-radius`）。要改整片卡片的内边距，用 `Inset` 或给内部区块加 `p`，不要到处覆盖这些变量。
- 从手写 `border` 换成 `Card` 时卡片会「矮」1–2px：`surface` 的描边是 `::after` 上的 inset ring，不占盒模型。这是预期差异，不是回归。
- `ghost` 无背景、`classic` 实心带阴影，与 `surface` 的差别不在描边而在底色层级。
- `Inset` 的 `p="current"` 是合法取值（沿用父级 Card 的内边距）；文档只列了取值，没有解释语义。

---

## 7. 表格

> 官方页：https://www.radix-ui.com/themes/docs/components/table.md

```tsx
<Table.Root variant="surface">
  <Table.Header><Table.Row><Table.ColumnHeaderCell justify="end">大小</Table.ColumnHeaderCell></Table.Row></Table.Header>
  <Table.Body>{rows.map((r) => <Table.Row key={r.id}><Table.RowHeaderCell>{r.name}</Table.RowHeaderCell><Table.Cell justify="end">{r.size}</Table.Cell></Table.Row>)}</Table.Body>
</Table.Root>
```

**不要用 Grid 手搓表格**，会丢三样东西：列宽随内容自适应、表头与数据行的语义关联、读屏的表格导航。

**两个官方没说的**：

- `Table.Root` **内部自带 `ScrollArea`**。外面再包一层会出现两条滚动条，先量再做。
- 数字列除 `justify="end"` 外还要 `font-variant-numeric: tabular-nums`，否则数字宽度不一，列看起来是歪的。

---

## 8. 文本类与字号继承

> 官方页：[Text](https://www.radix-ui.com/themes/docs/components/text.md)、[Heading](https://www.radix-ui.com/themes/docs/components/heading.md)

**有 `size` 的是 `Text` / `Heading` / `Link` / `Code` / `Kbd` / `Blockquote`**；`Strong` / `Em` / `Quote` 没有，靠 `1em` 继承父级字号。默认渲染元素：`strong` / `em` / `code` / `kbd` / `q`（`Quote`）/ `blockquote`（`Blockquote`）。

**两条容易踩的**：

1. **`Text` 的 `size` 不会被子级继承**。`<Text size="3"><Strong>粗</Strong></Text>` 里，`Strong` 通过 `font-size: 1em` 跟随，是因为它用相对单位；但 `<Text size="1"><Text size="3">` 里的内层是独立字号，外层不会影响它。
2. **`Heading` 与 `Text` 同 `size` 行高不同**。`Heading` 的 size 2–5 比 `Text` 紧 2px（18 vs 20、22 vs 24、24 vs 26、26 vs 28；源码 `--heading-line-height-*`）。把一段 CSS 手写的「标题」改成 `Heading size` 时行高会收紧，这是设计意图。

**`Heading` 的 `as` 与 `size` 是两个独立维度**：`as` 只决定语义层级（`h1`–`h6`），`size` 只决定视觉大小。两者不匹配是合法的，而且经常必要：

```tsx
<Heading as="h1" size="7">页面标题</Heading>   {/* 语义 1 级，视觉 7 档 */}
<Heading as="h2" size="2">面板标题</Heading>   {/* 语义 2 级，视觉 2 档 */}
```

**错的写法**：为了「看起来大」把面板标题写成 `as="h1"`（一页出现多个 h1）；或者为了「语义对」被迫用 `size="6"` 的巨大标题。

---

## 9. 反馈与提示

> 官方页：[Callout](https://www.radix-ui.com/themes/docs/components/callout.md)、[Progress](https://www.radix-ui.com/themes/docs/components/progress.md)、[Spinner](https://www.radix-ui.com/themes/docs/components/spinner.md)

```tsx
<Callout.Root color="amber" size="1">
  <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
  <Callout.Text>部分机台未响应，结果可能不完整。</Callout.Text>
</Callout.Root>
```

**四条官方没说的**：

- **`Button loading`** 会自动禁用并把内容换成 `Spinner`，别在按钮里自己画。
- **`Progress`**：确定进度给 `value`；不确定态**不给** `value`（`duration` 只是动画时长，没有 `infinite` 这个取值）。
- **`Badge`** 的 `color` 只接强调色族（26 个具名色），**没有**单阶控制——要更浅或更深的语义只能回 CSS；`variant="soft"` 最常用。
- **`@radix-ui/themes` 没有 Toast**（Primitives 有 `Toast` primitive）。全局提示用独立库（如 `sonner`）+ 令牌覆盖样式，或基于 primitive 自封。

---

## 10. 状态样式用哪些属性

> 这一节没有对应的官方页：`data-*` 是 Primitives 的行为，Themes 文档不列，只能读源码或 DevTools。

Radix 会在内部节点上输出 `data-*`，用它们写状态样式比自定义 class 更稳：

| 组件 | 属性 |
|---|---|
| `Switch` / `Checkbox` / `RadioGroup.Item` | `data-state="checked" \| "unchecked"`、`data-disabled` |
| `Select.Trigger` | `data-state="open" \| "closed"`、`data-placeholder` |
| `Tabs.Trigger` / `Content` | `data-state="active" \| "inactive"`、`data-orientation` |
| `TabNav.Link` | `data-active`（由 `active` prop 来） |
| `Dialog.Content` / `Popover.Content` / `DropdownMenu.*` | `data-state="open" \| "closed"` |
| `Tooltip.Content` | `data-state="delayed-open" \| "instant-open" \| "closed"` |
| `Progress.Root` | `data-state="indeterminate" \| "complete" \| "loading"`、`data-value`、`data-max` |
| 几乎所有带 `color` 的组件 | `data-accent-color` |
| `Badge` / `Checkbox` / `Switch` / `TextField.Root` / `Select.Trigger` / `SegmentedControl.Root` / `Progress` / `Avatar` | `data-radius` |

**规则**：

- 选中 / 展开 / 禁用这类**控件状态**用 `data-state` / `data-disabled`，不要用 `aria-*` 写样式。
- **文字颜色不要挂在自定义 `data-*` 上让 CSS 翻译**。`Text` 的 `color` 是静态 prop，用「语气 → 颜色」的映射表在 TSX 里翻，改一个语气只改一行。
- 只有三种情形颜色可以压在容器上：给 svg 图标上色、给图形上色、**随祖先状态变化**的文字色（`Text` 的 `color` 响应不了 `:hover` / `[aria-current]`）。

---

## 11. 继承 prop 面

> 官方依据：每个 Themes 组件页 API Reference 的首句（如 Dialog 页：「This component inherits props from the Dialog primitive.」）。
> prop 源：同名 primitive 页 `https://www.radix-ui.com/primitives/docs/components/<name>.md`。

**Themes 的 prop 表只列组件层新增的 prop**。继承来的 prop 不在表上：`Dialog.Content` 能接 `onEscapeKeyDown`，`Select.Root` 能接 `onValueChange`，`ScrollArea` 能接 `type`。把它们当成不存在，就会用 CSS 或手写 JS 重实现本该由 primitive 处理的行为——这是双写（`double-write`）的另一个入口。

### 11.1 三种变体

| 变体 | 例 | 页面上的判据 |
|---|---|---|
| 一比一继承 | `Dialog`、`Checkbox`、`Tabs`、`Slider` | 「inherits props from the X primitive」 |
| 跨部件合并 | `Tooltip`（Root + Portal + Content）、`ScrollArea`（Root + Viewport）、`Select`（按 part 分别声明） | 「inherits props from … parts」（只有 Tooltip 页面写了 merges） |
| 显式禁用 | `Dialog` 的 `modal` | 单独一句「the `modal` prop is unavailable」 |

### 11.2 继承清单（22 个）

| Themes 组件 | 继承自 | 备注 |
|---|---|---|
| `AlertDialog` | Alert Dialog primitive（Root / Trigger / Content / Title / Description / Action / Cancel） | 整棵子树一起继承 |
| `AspectRatio` | Aspect Ratio primitive | |
| `Avatar` | Avatar primitive | |
| `Checkbox` | Checkbox primitive | 单个组件，无点号 API |
| `ContextMenu` | Context Menu primitive | |
| `Dialog` | Dialog primitive | **`modal` 不可用** |
| `DropdownMenu` | Dropdown Menu primitive | |
| `HoverCard` | Hover Card primitive | |
| `Popover` | Popover primitive | |
| `Progress` | Progress primitive | |
| `RadioCards` | **Radio Group** primitive | 不是「Radio Cards primitive」 |
| `RadioGroup` | Radio Group primitive | |
| `Reset` | Slot（工具） | 页面写「renders a Slot primitive」——是渲染 Slot，不是 prop 继承 |
| `ScrollArea` | Scroll Area **Root + Viewport** | 合并两个部件 |
| `SegmentedControl` | Toggle Group primitive | 页面写「inherits props and functionality」 |
| `Select` | Select primitive，**按 part 分别继承** | Root；Trigger + Value；Portal + Content；Item；Group；Label；Separator |
| `Separator` | Separator primitive | |
| `Slider` | Slider primitive | |
| `Switch` | Switch primitive | |
| `TabNav` | Navigation Menu primitive | 页面只写「is based on」，未明说继承（按源码透传） |
| `Tabs` | Tabs primitive | |
| `Tooltip` | Tooltip **Root + Portal + Content** | 合并三个部件 |

### 11.3 不继承的 26 个

`Badge` `Blockquote` `Box` `Button` `Callout` `Card` `CheckboxCards` `CheckboxGroup` `Code` `Container` `DataList` `Flex` `Grid` `Heading` `IconButton` `Inset` `Kbd` `Link` `Radio` `Section` `Skeleton` `Spinner` `Table` `Text` `TextArea` `TextField`

这些页面写的是「based on `<button>` / `<div>` / `<table>`」或「基于 `Heading` / `Text` 组件」——prop 面就是页面上的那张表，**不要去找 primitive**。

另有 7 个组件既不在 11.2 也不在 11.3：`Em`、`Quote`、`AccessibleIcon`、`Portal`、`Slot`、`Theme`、`VisuallyHidden`。它们要么本身是 primitive 包装（`Slot` / `Portal`），要么没有继承关系——不要为它们去找 primitive。

### 11.4 被误当成「不存在」的高频继承 prop

```tsx
// ✅ 关闭行为：不要自己写 useEffect 监听 keydown
<Dialog.Content onEscapeKeyDown={(e) => confirmDiscard(e)} />

// ✅ 受控开关：Root 接着 primitive 的这组
<Dialog.Root open={open} onOpenChange={setOpen} />

// ✅ 弹出定位：侧向、偏移、边界避让
<Tooltip content="刷新" side="bottom" sideOffset={4} collisionPadding={8}>
  <IconButton aria-label="刷新"><UpdateIcon /></IconButton>
</Tooltip>

// ✅ 滚动条策略（ScrollArea）：hover / scroll / auto / always
<ScrollArea type="scroll" scrollbars="vertical">
```

已核对过的继承 prop（按组件）：`AspectRatio`（`ratio`）、`Checkbox`（`checked` / `defaultChecked` / `onCheckedChange` / `required` / `name` / `value`）、`Progress`（`value` / `max` / `getValueLabel`）、`ScrollArea`（`type` / `scrollHideDelay` / `dir`）、`Tooltip`（`open` / `defaultOpen` / `onOpenChange` / `delayDuration` / `side` / `sideOffset` / `align` / `collisionPadding` / `onEscapeKeyDown` / `onPointerDownOutside` / `forceMount`）。

### 11.5 「supports common margin props」

30 多个组件页写着这句话，含义是：**它们接 margin 档位**（`m` / `mt` / `mx` / `my` / `mr` / `mb` / `ml`）。在这些组件上写 CSS `margin` 就是双写。最常被漏掉的是 `Card`、`Table.Root`、`Callout.Root`、`Badge`、`Button`、`Text`、`Tabs`、`Tooltip`、`Select.Trigger`。

### 11.6 怎么自己确认（三种情况）

1. **有网**：打开 Themes 组件页读 API Reference 首句，再开它链接的 primitive 页（prop 源）读 API 表。
2. **有 `node_modules`**：直接看类型里的继承来源。

```bash
# 先定位类型文件（路径随版本不同，不要背路径）
grep -rln "DialogPrimitive" node_modules/@radix-ui/themes/dist --include=*.d.ts | head
```

看到 `React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>` 就是继承；被 `Omit<…, 'modal'>` 掉的 prop 就是禁用。

3. **两者都没有**：按本文 11.2 / 11.4 的表走；表里没有的，**不要猜**——在代码注释里写明「此 prop 未核实」，并改用文档能确认的写法。
