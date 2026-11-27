# 组件组合与继承 Prop 面

`@radix-ui/themes`（v3.3+，共 56 个导出组件）分四类 API 形态。本文件聚焦官方文档未直接展开的三件事：**子部件必填项（缺了会怎样）**、**`asChild` 与受控细节**、**22 个组件的底层 Primitive 继承 prop 面**。单个组件的常规 prop 定义查 [llms.txt](llms.txt) 或本地 `node_modules/@radix-ui/themes/src/components/*.props.tsx`。

## 目录

1. [先看清 API 形态](#1-先看清-api-形态)
2. [点号子组件的必填项](#2-点号子组件的必填项)
3. [asChild 的适用范围与限制](#3-aschild-的适用范围与限制)
4. [表单：受控与非受控](#4-表单受控与非受控)
5. [按钮与操作层级](#5-按钮与操作层级)
6. [卡片与 Inset](#6-卡片与-inset)
7. [表格](#7-表格)
8. [文本类与字号继承](#8-文本类与字号继承)
9. [反馈、加载态与 DataList](#9-反馈加载态与-datalist)
10. [状态样式用哪些属性](#10-状态样式用哪些属性)
11. [继承 prop 面](#11-继承-prop-面)
12. [Utilities 工具组件](#12-utilities-工具组件)

---

## 1. 先看清 API 形态

| 形态 | 组件 | 用法 |
| --- | --- | --- |
| **单一组件** | `Box` `Flex` `Grid` `Section` `Container` `Card` `Inset` `Badge` `Button` `IconButton` `Avatar` `Code` `Kbd` `Quote` `Blockquote` `Strong` `Em` `Link` `Text` `Heading` `Skeleton` `Spinner` `Switch` `Checkbox` `Slider` `Radio` `TextArea` `Progress` `ScrollArea` `Separator` `AspectRatio` | 直接渲染 |
| **点号复合组件** | `Dialog` `AlertDialog` `Popover` `DropdownMenu` `ContextMenu` `HoverCard` `Select` `Tabs` `TabNav` `Table` `TextField` `RadioGroup` `CheckboxGroup` `SegmentedControl` `DataList` `Callout` | 按层级组合子部件 |
| **卡片式选择集** | `CheckboxCards` `RadioCards` | `Root` + `Item` |
| **工具与顶层组件** | `Tooltip`（无子部件，文本走 `content` prop）、`AccessibleIcon`、`VisuallyHidden`、`Reset`、`Slot`、`Portal`、`Theme` | 承载无障碍、挂载或主题上下文 |

---

## 2. 点号子组件的必填项

| 组件 | 子部件全集 | 事实必填项 | 缺失后果 / 关键注意 |
| --- | --- | --- | --- |
| `Dialog` | `Root` `Trigger` `Content` `Title` `Description` `Close` | `Content` + **`Title`** | 缺 `Title` 会导致 `aria-labelledby` 悬空，读屏只念「dialog」；无 `Description` 时在 `Content` 传 `aria-describedby={undefined}` |
| `AlertDialog` | `Root` `Trigger` `Content` `Title` `Description` `Action` `Cancel` | `Content` `Title` `Action` `Cancel` | 取消按钮必须包在 `AlertDialog.Cancel` 内以保证 Esc 与焦点回退语义 |
| `Popover` | `Root` `Trigger` `Content` `Close` `Anchor` | `Content` +（`Trigger` 或 `Anchor`） | 缺触发器与锚点则无法计算浮层定位 |
| `DropdownMenu` / `ContextMenu` | `Root` `Trigger` `Content` `Label` `Item` `Group` `RadioGroup` `RadioItem` `CheckboxItem` `Sub` `SubTrigger` `SubContent` `Separator` | `Content` `Item` | `ContextMenu` 无 `TriggerIcon`，由右键触发 |
| `HoverCard` | `Root` `Trigger` `Content` | 三者齐全 | 仅用于预览补充信息，不放核心操作 |
| `Tooltip` | **无子组件** | `content` prop + 唯一子元素 | 包裹 `disabled` 元素需外包带 `tabIndex={0}` 的容器 |
| `Select` | `Root` `Trigger` `Content` `Item` `Group` `Label` `Separator` | `Root` `Trigger` `Content` `Item` | `Group` 搭配 `Label` 才有分组无障碍关联 |
| `Tabs` | `Root` `List` `Trigger` `Content` | `List` `Trigger` `Content` | 页内面板切换专用 |
| `TabNav` | `Root` `Link`（含 `active` prop） | `Root` `Link` | URL 路由级标签导航专用 |
| `Table` | `Root` `Header` `Body` `Row` `Cell` `ColumnHeaderCell` `RowHeaderCell` | `Root` `Body` `Row` `Cell` | `Table.Root` 内部已含 `ScrollArea`，避免外层重复嵌套 |
| `TextField` | `Root` `Slot` | `Root` | v3 起 `Root` 直接接 `value`/`onChange`/`placeholder`/`ref`，不再写废弃的 `TextField.Input` |
| `RadioGroup` / `CheckboxGroup` | `Root` `Item` | `Root` `Item` | `Item` 含文本子节点时自动生成 `<label>` |
| `SegmentedControl` | `Root` `Item` | `Root` `Item`（`value` 必填） | 激活态字重切换零宽度抖动 |
| `DataList` | `Root` `Item` `Label` `Value` | 四者齐全 | 原生渲染 `<dl>` / `<div>` / `<dt>` / `<dd>` |
| `Callout` | `Root` `Icon` `Text` | `Root` + `Text` | 说明正文放进 `Callout.Text` 以对齐图标行高 |

### 破坏性确认标准骨架

```tsx
<AlertDialog.Root>
  <AlertDialog.Trigger><Button color="red">删除</Button></AlertDialog.Trigger>
  <AlertDialog.Content maxWidth="450px">
    <AlertDialog.Title>删除这 3 个文件？</AlertDialog.Title>
    <AlertDialog.Description size="2" color="gray">删除后无法恢复。</AlertDialog.Description>
    <Flex gap="3" mt="4" justify="end">
      <AlertDialog.Cancel><Button variant="soft" color="gray">取消</Button></AlertDialog.Cancel>
      <AlertDialog.Action><Button color="red">确认删除</Button></AlertDialog.Action>
    </Flex>
  </AlertDialog.Content>
</AlertDialog.Root>
```

---

## 3. `asChild` 的适用范围与限制

- **支持 `asChild`**：5 大布局容器、`Card`、`Inset`、`Badge`、`Button`、`IconButton`、9 大排版组件、`Callout.Root`、`Avatar`、`ScrollArea`、`Theme`、`Dialog.Content`、`AlertDialog.Content`、`Popover.Content`、`HoverCard.Content`、`Tabs.Root`、`Tabs.Content`、`TabNav.Link`。
- **不支持 `asChild`**：`Dialog.Title`（视觉隐藏请用 `<VisuallyHidden><Dialog.Title>…</Dialog.Title></VisuallyHidden>`）、`Dialog.Description`、`Table.*`、`Separator`、`Progress` 及大多数组合表单控件的 `Root`。
- **单元素约束**：开启 `asChild` 时子节点必须是**唯一一个可接收 props 的 React 元素**（传入纯文本或多个同级子节点会在运行时报 `Slot` 错误）。

---

## 4. 表单：受控与非受控

```tsx
<TextField.Root value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索…" />

<Select.Root value={mode} onValueChange={setMode}>
  <Select.Trigger />
  <Select.Content position="popper" sideOffset={4}>
    <Select.Item value="light">浅色</Select.Item>
    <Select.Item value="dark">深色</Select.Item>
  </Select.Content>
</Select.Root>
```

- `Select.Content` 默认 `position="item-aligned"`（对齐选中项盖住触发器）；常规朝下展开菜单显式传 `position="popper"` 后，`side` / `sideOffset` / `align` 才生效。
- 切勿在同一控件上混传 `value` 与 `defaultValue`；`Checkbox` 的 `checked` 支持 `boolean | 'indeterminate'`。

---

## 5. 按钮与操作层级

| 变体 | 视觉与层级语义 | 典型场景 |
| --- | --- | --- |
| `solid`（默认） | 主操作实心强调 | 单个面板/弹窗内的唯一主提交动作 |
| `soft` | 柔和次级底色 | 取消、刷新、常规次要动作 |
| `surface` / `outline` | 带清晰描边 | 与面板同底色需边界感时 |
| `ghost` | 透明无底 | 工具栏、表格行内操作、图标按钮 |
| `classic` | 带立体微阴影 | 特殊拟物强调 |

- 四档 `size="1"–"4"` 高度约为 `24 / 32 / 40 / 48px`。
- `<IconButton>` 必须提供 `aria-label`；`<Button loading={busy}>` 会自动禁用并切换内置转轮。

---

## 6. 卡片与 Inset

```tsx
<Card size="2">
  <Heading as="h3" size="3">结果列表</Heading>
  <Inset side="bottom" mt="3">
    <Table.Root>…</Table.Root>
  </Inset>
</Card>

<Card asChild>
  <a href="#detail">
    <Text size="2" weight="bold">可交互卡片</Text>
  </a>
</Card>
```

- `<Card>` 默认 `variant="surface"`、`size="1"`；包裹 `<a>` 或 `<button>` 并传 `asChild` 时自动启用悬浮/按压交互态。
- `<Inset>` 用于局部抵消父 `Card` / `Dialog.Content` / `Popover.Content` 的内边距，`p="current"` 可让内嵌区域重新继承父容器同档内边距。

---

## 7. 表格

```tsx
<Table.Root variant="surface" layout="fixed">
  <Table.Header>
    <Table.Row>
      <Table.ColumnHeaderCell width="180px">文件名</Table.ColumnHeaderCell>
      <Table.ColumnHeaderCell width="100px" justify="end">大小</Table.ColumnHeaderCell>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {rows.map((r) => (
      <Table.Row key={r.id}>
        <Table.RowHeaderCell>{r.name}</Table.RowHeaderCell>
        <Table.Cell justify="end" className="tabular">{r.size}</Table.Cell>
      </Table.Row>
    ))}
  </Table.Body>
</Table.Root>
```

- 列宽与对齐直接用 `Table.Root layout="fixed"` + 单元格 `width` / `minWidth` / `maxWidth` / `justify` props 控制；数值列配 `font-variant-numeric: tabular-nums`。

---

## 8. 文本类与字号继承

- 拥有独立 `size` prop 的 6 个排版组件：`Text`、`Heading`、`Link`、`Code`、`Kbd`、`Blockquote`；而 `Strong`、`Em`、`Quote` 无 `size` prop，通过 `1em` 自然跟随父级字号。
- `<Kbd>` 默认 `variant="classic"`，3.3+ 新增 `variant="soft"` 适配轻量快捷键提示。
- `Heading` 的 `as`（文档语义层级 `h1`–`h6`）与 `size`（视觉字号 `1`–`9`）相互独立，单页保持唯一 `h1`，面板标题用 `<Heading as="h2" size="2" | "3">`。

---

## 9. 反馈、加载态与 DataList

- **零布局抖动加载态**：`Skeleton` 与 `Spinner` 直接包裹真实内容并通过 `loading={isLoading}` 切换，自动保留子元素几何占位，不写三元分支切换定宽高占位块：
  ```tsx
  <Skeleton loading={isLoading}><Heading as="h3" size="4">{title ?? '占位标题'}</Heading></Skeleton>
  <Spinner loading={isSaving}><Button onClick={save}>保存</Button></Spinner>
  ```
- **`Progress`**：确定进度传 `value={percent}`，不确定循环态省略 `value` 即可。
- **`DataList`**：键值详情优先使用 `DataList`，支持响应式 `orientation={{ initial: 'vertical', sm: 'horizontal' }}` 与 `<DataList.Label width="100px" color="gray">`。

---

## 10. 状态样式用哪些属性

自定义状态 CSS 优先挂在 Radix 原生输出的 `data-*` 属性上：

| 组件 | 原生输出的 `data-*` 属性 |
| --- | --- |
| `Switch` / `Checkbox` / `RadioGroup.Item` | `data-state="checked" \| "unchecked" \| "indeterminate"`、`data-disabled` |
| `Select.Trigger` | `data-state="open" \| "closed"`、`data-placeholder` |
| `Tabs.Trigger` / `Tabs.Content` | `data-state="active" \| "inactive"`、`data-orientation` |
| `TabNav.Link` | `data-active` |
| `Dialog` / `Popover` / `DropdownMenu` `Content` | `data-state="open" \| "closed"` |
| `Tooltip` 内容层 | `data-state="delayed-open" \| "instant-open" \| "closed"` |
| `Progress` | `data-state="indeterminate" \| "complete" \| "loading"`、`data-value`、`data-max` |

---

## 11. 继承 prop 面

Themes 组件文档的 API 表**只列组件层新增的 prop**；以下 22 个组件同时透传底层 Radix Primitive 的交互与定位 prop。

### 11.1 三种继承形态

1. **一比一透传**：`Dialog`、`AlertDialog`、`Checkbox`、`Tabs`、`Slider`、`Switch` 等直接透传对应部件。
2. **跨部件合并**：`Tooltip`（合并 `Root + Portal + Content`）、`ScrollArea`（合并 `Root + Viewport`）、`Select`（`Trigger` 含 `Value`，`Content` 含 `Portal`）。
3. **显式剔除**：`Dialog.Root` 剔除了 `modal` prop。

### 11.2 继承 Primitive Props 的 22 个组件

| Themes 组件 | 底层 Primitive 来源 | 高频继承 Props 示例 |
| --- | --- | --- |
| `AlertDialog` | Alert Dialog | `open`, `onOpenChange`, `Content.onEscapeKeyDown` |
| `AspectRatio` | Aspect Ratio | `ratio` |
| `Avatar` | Avatar | `src`, `alt`, `onLoadingStatusChange`, `delayMs` |
| `Checkbox` | Checkbox | `checked`（含 `'indeterminate'`）, `defaultChecked`, `onCheckedChange`, `name`, `required` |
| `ContextMenu` | Context Menu | `onOpenChange`, `Content.collisionPadding`, `Item.onSelect` |
| `Dialog` | Dialog（无 `modal`） | `open`, `onOpenChange`, `Content.onEscapeKeyDown`, `Content.onPointerDownOutside`, `Content.onOpenAutoFocus` |
| `DropdownMenu` | Dropdown Menu | `open`, `onOpenChange`, `Content.side`, `Content.align`, `Content.sideOffset`, `Item.onSelect` |
| `HoverCard` | Hover Card | `openDelay`, `closeDelay`, `Content.side`, `Content.align` |
| `Popover` | Popover | `open`, `onOpenChange`, `Content.side`, `Content.align`, `Content.sideOffset`, `Content.collisionPadding` |
| `Progress` | Progress | `value`, `max`, `getValueLabel` |
| `RadioCards` | Radio Group | `value`, `defaultValue`, `onValueChange`, `name`, `required` |
| `RadioGroup` | Radio Group | `value`, `defaultValue`, `onValueChange`, `orientation`, `loop` |
| `Reset` | Slot | 单子元素属性合并 |
| `ScrollArea` | Scroll Area（Root + Viewport） | `type`（默认 `'hover'`）, `scrollHideDelay`, `dir` |
| `SegmentedControl` | Toggle Group（单选封装） | `value`, `defaultValue`, `onValueChange` |
| `Select` | Select（按子部件） | `value`, `onValueChange`, `open`, `Content.position`, `Content.sideOffset` |
| `Separator` | Separator | `decorative` |
| `Slider` | Slider | `value`, `defaultValue`, `onValueChange`, `onValueCommit`, `min`, `max`, `step` |
| `Switch` | Switch | `checked`, `defaultChecked`, `onCheckedChange`, `name`, `required` |
| `TabNav` | Navigation Menu | `Root` 导航菜单属性，`Link.active`, `Link.onSelect` |
| `Tabs` | Tabs | `value`, `defaultValue`, `onValueChange`, `orientation`, `activationMode` |
| `Tooltip` | Tooltip（Root + Portal + Content） | `open`, `defaultOpen`, `onOpenChange`, `delayDuration`, `side`, `sideOffset`, `align`, `collisionPadding` |

### 11.3 基于原生元素或内部组合的其余 34 个组件

- **常规组件（27 个）**：`Badge` `Blockquote` `Box` `Button` `Callout` `Card` `CheckboxCards` `CheckboxGroup` `Code` `Container` `DataList` `Flex` `Grid` `Heading` `IconButton` `Inset` `Kbd` `Link` `Radio` `Section` `Skeleton` `Spinner` `Strong` `Table` `Text` `TextArea` `TextField`
- **格式与工具组件（7 个）**：`Em` `Quote` `AccessibleIcon` `Portal` `Slot` `Theme` `VisuallyHidden`

> 上述绝大部分组件均支持通用外边距 `MarginProps`（`m`/`mx`/`my`/`mt`/`mr`/`mb`/`ml`），不要在 CSS 里重复写外边距。

### 11.6 怎么自己确认（三种情况）

1. **查本地源码/类型（最准）**：
   ```bash
   grep -rln "DialogPrimitive" node_modules/@radix-ui/themes/dist --include=*.d.ts | head -n 5
   ```
   看到 `ComponentPropsWithoutRef<typeof XPrimitive.Part>` 即为继承，`Omit<..., 'prop'>` 即为剔除。
2. **查官方文档**：打开 [llms.txt](llms.txt) 对应组件 `.md`，读 API Reference 首句链接的 Primitive 页（prop 源）。
3. **离线不确定时**：按 11.2 表已确认的 prop 编写，不臆造未核实属性。

---

## 12. Utilities 工具组件

| 组件 | 用途 | 标准写法 |
| --- | --- | --- |
| `AccessibleIcon` | 为无可见文字的裸图标提供读屏标签 | `<AccessibleIcon label="关闭"><CloseIcon /></AccessibleIcon>`（已用 `<IconButton aria-label="关闭">` 时不必重复套） |
| `VisuallyHidden` | 视觉隐藏但对读屏器保留的语义标题/说明 | `<VisuallyHidden><Dialog.Title>详情</Dialog.Title></VisuallyHidden>` |
| `Reset` | 剥离原生表单/列表元素的浏览器默认外观 | `<Reset><button type="button">…</button></Reset>` |
| `Portal` | 将自定义浮层挂载到 `document.body` 或指定容器 | 内置 `Dialog`/`Popover`/`Select` 已含 Portal，无需重复包裹 |
| `Slot` | 自定义组件实现 `asChild` 透传的底层工具 | 仅接收单个 React 元素子节点 |
