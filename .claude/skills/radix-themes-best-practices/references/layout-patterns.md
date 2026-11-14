# 布局模式：后台 / 工具类界面的十种拼法

这份文件只回答一件事：**这个界面该用哪些组件、怎么拼。**
「该选哪个组件、要不要封成业务组件、什么时候破例」见 [practices.md](practices.md)。

每个模式都是「需求 → 正例 → 反例 → 为什么」。反例全部是真实见过的写法；其中 `columns={3}` 这类会被 TypeScript 拦下（类型只接字符串档位），其余都是能编译通过的。
值取 Radix 档位（`"1"`–`"9"` = 4/8/12/16/24/32/40/48/64px），固定尺寸除外。

> 规则的**理由**（双写的机制、尺度的边界）在 [rules.md](rules.md)；
> 这份文件只讲「怎么拼」。踩过的坑按现象索引在 [pitfalls.md](pitfalls.md)。

## 目录

| # | 模式 | 什么时候用 |
|---|---|---|
| 1 | 页面骨架 | 任何有标题、有滚动的整页 |
| 2 | 工具栏 | 一行操作按钮 + 计数 + 筛选 |
| 3 | 卡片网格 | 统计块、选项组、指标卡 |
| 4 | 表单行 | 设置项、属性编辑 |
| 5 | 列表项 | 文件行、历史记录、检查结果 |
| 6 | 空态 | 无数据、无结果、出错 |
| 7 | 统计块 | 数字 + 单位 + 标签 |
| 8 | 滚动面板 | 内容超出高度、需要独立滚动 |
| 9 | 弹窗 | 确认、表单、详情 |
| 10 | 分栏 | 左列表 + 右详情，或导航 + 内容 |

---

## 1. 页面骨架

**需求**：顶部固定标题，正文独立滚动，整页不跟着滚。

```tsx
// ✅ 外壳只管尺寸与裁剪，滚动交给 ScrollArea
<Flex direction="column" width="100vw" height="100vh" overflow="hidden">
  <Flex flexGrow="1" flexBasis="0" minHeight="0" overflow="hidden">
    <AppSidebar />
    <Flex direction="column" flexGrow="1" flexBasis="0" minWidth="0" overflow="hidden" m="3">
      <ScrollArea type="auto" scrollbars="vertical" style={{ flexGrow: 1 }}>
        <Box px="4" py="3">
          <Heading as="h1" size="4" mb="4">页面标题</Heading>
          <Outlet />
        </Box>
      </ScrollArea>
    </Flex>
  </Flex>
</Flex>
```

```tsx
// ❌ 手写滚动容器 + flex 三件套散落在 CSS
<div className="app-shell">…</div>
.app-shell { display: flex; flex-direction: column; height: 100vh; }
.app-body { flex: 1; min-height: 0; overflow-y: auto; }
```

**为什么**：

- `flexGrow` + `flexBasis="0"` + `minHeight="0"` 是「占满剩余高度且可收缩」的固定组合，缺 `minHeight="0"` 时子元素会撑破父级而不是滚动。这三个都是 prop，写进 CSS 就是双写。
- `ScrollArea` 不接受 `flexGrow`：源码的 render 只透传 `type` / `scrollHideDelay` / `asChild` / `style` / `className`，其余 props 被**静默丢弃**——不报错也不生效。用 `style={{ flexGrow: 1 }}` 或外面包一层 `Flex` 让它 `flexGrow="1"`。这是少数必须动用 `style` 的地方，写注释说明。
- 页面 DOM 里只应该有一个 `h1`。面板标题用 `h2`、面板内小节用 `h3`，视觉大小另由 `size` 决定（见 §3 的说明）。

---

## 2. 工具栏

**需求**：左边一组操作，右边计数 / 筛选；窄屏要换行。

```tsx
// ✅ Flex 管排布，gap 管间距，右侧用一个可撑开的占位
<Flex align="center" gap="2" wrap="wrap" py="2" px="3">
  <Button variant="soft" onClick={refresh}>
    <ReloadIcon /> 刷新
  </Button>
  <Button variant="ghost" color="gray" onClick={exportAll}>导出</Button>
  <Box flexGrow="1" minWidth="0" />
  <Text size="1" color="gray" className="tabular">{count} 条</Text>
  <SegmentedControl.Root value={filter} onValueChange={setFilter}>
    <SegmentedControl.Item value="all">全部</SegmentedControl.Item>
    <SegmentedControl.Item value="failed">失败</SegmentedControl.Item>
  </SegmentedControl.Root>
</Flex>
```

```tsx
// ❌ 用 justify="between" 硬分左右，但左侧按钮一多就贴在一起
<Flex justify="between">
  <Button>刷新</Button><Button>导出</Button>
  <Text>{count}</Text>
</Flex>

// ❌ 用 marginLeft="auto" 这类手写把右侧推开
<Button style={{ marginLeft: 'auto' }}>…
```

**为什么**：

- `justify="between"` 只在**两个**子节点时语义正确；三个以上它会均分，视觉上按钮被拉开。
- `marginLeft: auto` 是 CSS 技巧，Radix 的 margin prop 是 `ml="auto"`（任意字符串值合法），但把「占位」表达成 `Box flexGrow="1"` 更直白，也让插入新按钮不会破坏布局。
- `wrap="wrap"` 是工具栏的默认要求：窗口缩放时按钮换行，而不是把计数挤出可视区。

---

## 3. 卡片网格

**需求**：等宽卡片阵列，随窗口数变列数。

```tsx
// ✅ Grid 的 columns 只接字符串；列模板用 minmax 保证可收缩
<Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="3">
  {items.map((item) => (
    <Card key={item.id} variant="surface">
      <Flex direction="column" gap="2">
        <Heading as="h3" size="2" trim="both">{item.title}</Heading>
        <Text as="p" size="1" color="gray">{item.description}</Text>
      </Flex>
    </Card>
  ))}
</Grid>

// 列宽不等时给列模板字符串
<Grid columns="minmax(280px, 1fr) 2fr" gap="4" align="start">…</Grid>
```

```tsx
// ❌ 数字：无 class、无内联变量，列数直接丢失（实测 <div class="rt-Grid rt-r-gtc">）
<Grid columns={3} gap="3">…

// ❌ 用 CSS 手写 grid-template，与 <Grid> 的 display:grid 重复
<Grid className="cards" gap="3">…
.cards { display: grid; grid-template-columns: repeat(3, 1fr); }
```

**为什么**：

- `columns={3}` 在 TS 项目里是**类型错误**（`columns` 只接受字符串档位或合法 CSS 值）；用 JS 或 `as any` 绕过时才会静默丢列。要用 `columns="3"`。
- 响应式对象 `{{ initial, sm, md, lg, xl }}` 对 `columns` / `gap` / 所有间距 prop 都成立。
- `Card` 的内边距与圆角**只由 `size` 决定**。要改内边距，各区块自己 `p` / `px` / `py`；不要覆盖 `--base-card-padding-*` 只为调一处。

---

## 4. 表单行

**需求**：左边标签 + 说明，右边控件，行间有分隔线。

```tsx
// ✅ 行自己承载分隔线；标签区允许收缩
<Flex
  className="form-row"
  align="center"
  justify="between"
  gap="5"
  minHeight="52px"
  py="2"
  px="4"
>
  <Flex direction="column" gap="1" minWidth="0" flexBasis="0" flexGrow="1" maxWidth="50%">
    <Text as="p" size="2" weight="medium">{label}</Text>
    {description ? <Text as="p" size="1" className="hint">{description}</Text> : null}
  </Flex>
  <Box flexShrink="0">{children}</Box>
</Flex>
```

```css
/* ✅ CSS 只留那条线 */
.form-row + .form-row {
  border-top: 1px solid var(--gray-a5);
}
```

```tsx
// ❌ 用 Separator 分隔 + 父级 gap：线只能撑到内容宽度，不贯穿卡片
<Flex direction="column" gap="2">
  <Row /><Separator size="4" /><Row />
</Flex>

// ❌ 标签区不给 minWidth="0"：长说明文字把控件挤出可视区
```

**为什么**：

- 有 `gap` 时相邻行之间本来就隔着空隙，`Separator` 只能画在这段空隙里，看起来是「短横线」。要让分隔线贯穿容器，**线必须在行上**（`border-top`），而行的 `padding` 要能盖过它。
- `maxWidth="50%"` 保证右侧控件至少占一半宽度；`minWidth="0"` 让左侧文字可以截断而不是撑开。
- 说明文字的 `color` 在 `Text` 上走 prop；但如果要 `gray-10`（比 `color="gray"` 的 11 阶更浅），只能 CSS——这是 [rules.md §5](rules.md) 的例外，别删。

---

## 5. 列表项

**需求**：图标 + 主文字 + 次文字 + 尾部操作，长文字要截断。

```tsx
// ✅ 截断链：每一层 flex item 都要能收缩
<Flex align="center" gap="2" py="2" px="3">
  <Box flexShrink="0" className="row-icon"><FileIcon /></Box>
  <Flex direction="column" minWidth="0" flexGrow="1">
    <Text size="2" truncate>{name}</Text>
    <Text size="1" color="gray" truncate>{path}</Text>
  </Flex>
  <Badge color={badgeColor} variant="soft" flexShrink="0">{status}</Badge>
  <IconButton variant="ghost" aria-label="更多操作" flexShrink="0"><DotsIcon /></IconButton>
</Flex>
```

```tsx
// ❌ 只加 truncate，不加 minWidth="0"：文字撑开父级，省略号永远不出现
<Flex align="center" gap="2">
  <Text truncate>{name}</Text>
</Flex>

// ❌ 把截断三件套写在 CSS 里
.row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

**为什么**：

- flex item 默认 `min-width: auto`，不会小于内容的 min-content 宽度。`truncate` 只在元素**真的有宽度上限**时才生效，所以中间的 flex item 必须 `minWidth="0"`。
- 固定宽度的元素（图标、徽标、按钮）要 `flexShrink="0"`，否则会被压扁——这是列表项最常见的视觉 bug。
- `truncate` 生成的 `.rt-truncate` 与手写三件套声明完全一致，用 prop 只是让「意图」出现在 JSX 里。

---

## 6. 空态

**需求**：居中图标 + 标题 + 说明 + 可选操作。

```tsx
<Flex direction="column" align="center" justify="center" gap="2" py="6" px="4" className="centered">
  <Flex align="center" justify="center" width="42px" height="42px" mb="1" className="empty-icon">
    <InboxIcon />
  </Flex>
  <Text as="p" size="2" weight="medium">{title}</Text>
  <Text as="p" size="1" className="hint">{description}</Text>
  {action ? <Box mt="1">{action}</Box> : null}
</Flex>
```

```tsx
// ❌ 标题靠 CSS 写 margin 与 font-size
.empty-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--gray-12); }

// ❌ 内边距写成多值档位
<Flex py="6 4">…
```

**为什么**：

- `.rt-Text` / `.rt-Heading` 本来就是 `margin: 0`，根节点本来就是 `gray-12`——这三条 CSS 是纯冗余。
- 固定尺寸（图标 42px）不受档位约束，写原值是对的；但**间距**（`mb="1"`、`gap="2"`）必须走档位。
- `py="6 4"` 这种档位多值会让 padding 整条失效变 0，空态会贴边。

---

## 7. 统计块

**需求**：大数字 + 单位 + 标签，数字等宽对齐。

```tsx
<Flex direction="column" gap="1" minWidth="0" p="3" className="stat">
  <Text as="div" size="1" weight="medium" className="stat-label">{label}</Text>
  <Text as="div" size="5" weight="bold" truncate className="tabular">
    {value}
    {unit ? <Text as="span" size="1" weight="medium" ml="1" className="stat-unit">{unit}</Text> : null}
  </Text>
</Flex>
```

```css
.stat-label { color: var(--gray-10); }   /* Text color 只到 11 阶，这里的例外是必要的 */
.stat-unit  { color: var(--gray-9); }
.tabular    { font-variant-numeric: tabular-nums; }
```

```tsx
// ❌ 大数字手写字号与行高
.stat-value { font-size: 21px; font-weight: 680; line-height: 1.15; letter-spacing: -0.03em; }

// ❌ 数值色挂在 data-tone 上，由 CSS 翻译
<Text data-tone="danger">…</Text>
.stat[data-tone='danger'] .stat-value { color: var(--red-11); }
```

**为什么**：

- `size="5"`（20px）+ `weight="bold"` 就是「大数字」；`680` 这种字重 Radix 没有，写下去就是一套私有尺度。
- 语气 → 颜色应该在 TSX 里用映射表翻译，CSS 只认颜色不认语义：

```tsx
const TONE_COLOR = { default: undefined, accent: 'indigo', success: 'green', danger: 'red' } as const
<Text color={TONE_COLOR[tone]} highContrast={tone === 'default' ? true : undefined}>
```

- `Text` **没有** `accentColor` 这个概念，`color` 只接具名色。想「跟随主题强调色」只能写具体色名（如 `indigo`），换 accentColor 时要同步改。

---

## 8. 滚动面板

**需求**：一块固定高度的区域，内容超出时只滚这块。

```tsx
// ✅ ScrollArea 只负责滚；撑满由外层决定
<Flex direction="column" height="100%" minHeight="0" overflow="hidden">
  <Flex align="center" justify="between" py="2" px="3" className="panel-head">
    <Text size="2" weight="medium">{title}</Text>
  </Flex>
  <ScrollArea type="auto" scrollbars="vertical" style={{ flexGrow: 1 }}>
    <Box p="3">
      {items.map((item) => <Row key={item.id} item={item} />)}
    </Box>
  </ScrollArea>
</Flex>
```

```tsx
// ❌ 直接给 ScrollArea 传 flexGrow：prop 被静默丢弃（不转发到 DOM），内部视口也不吃它
<ScrollArea flexGrow="1">…

// ❌ 写原生 overflow 滚动条
<div className="list" style={{ overflowY: 'auto' }}>…
.list { overflow-y: auto; }
```

**为什么**：

- `ScrollArea` 只接 `size` / `radius` / `scrollbars` / `type` 和 margin props。传 `flexGrow` 会被静默丢弃（源码不转发其余 props），不报错也不生效。
- 它的内部 Viewport 是 `display:flex; flex-direction:column`，滚动长度来自子元素；给视口加 `flexGrow` 会把它撑到内容高度，反而不滚。
- `Table.Root` 内部**已经**带一个 `ScrollArea`。在 `ScrollArea` 里再放 `Table` 会出现两层滚动条，量一下再决定留哪层。

---

## 9. 弹窗

**需求**：确认操作、短表单、详情预览。

```tsx
<Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Content maxWidth="450px" aria-describedby={undefined}>
    <Dialog.Title>删除这 3 个文件？</Dialog.Title>
    <Text as="p" size="2" color="gray" mt="2">删除后无法恢复。</Text>
    <Flex gap="3" justify="end" mt="4">
      <Dialog.Close>
        <Button variant="soft" color="gray">取消</Button>
      </Dialog.Close>
      <Button color="red" onClick={remove}>删除</Button>
    </Flex>
  </Dialog.Content>
</Dialog.Root>
```

```tsx
// ❌ 没有 Title：对话框失去可访问名称，读屏只会念「dialog」
<Dialog.Content><Text>确定吗？</Text></Dialog.Content>

// ❌ 标题只用 CSS 撑大来「看起来像标题」
<Dialog.Content><div className="modal-title">确定吗？</div></Dialog.Content>

// ❌ 破坏性操作只用 Dialog，不用 AlertDialog，也不区分主次按钮
```

**为什么**：

- `Dialog.Title` 缺席**不会抛错**，只是 `aria-labelledby` 变成空——这是最安静的 a11y 缺陷（实测：有 Title 时生成 `aria-labelledby`，没有时完全没有这个属性）。
- 破坏性确认用 `AlertDialog`，且取消必须走 `AlertDialog.Cancel`，不要自己放一个普通 `Button`。
- 按钮视觉层级：主动作用 `solid`，次动作用 `soft` / `outline`，单行内导航用 `ghost`。同一容器里不要出现两个 `solid`。

---

## 10. 分栏

**需求**：左侧窄、右侧宽；左侧列表，右侧详情。

```tsx
// ✅ Grid 两栏，左列定宽下限，右列可收缩
<Grid columns="minmax(280px, 360px) minmax(0, 1fr)" gap="4" align="start">
  <Card variant="surface">
    <ScrollArea scrollbars="vertical" style={{ maxHeight: 480 }}>
      <Box p="2">{list}</Box>
    </ScrollArea>
  </Card>
  <Card variant="surface">
    <Box p="4">{detail}</Box>
  </Card>
</Grid>
```

```tsx
// ❌ 两栏都用 Flex + flex="1"，右栏永远比左栏宽不了多少
<Flex gap="4">
  <Box flexGrow="1">…</Box>
  <Box flexGrow="1">…</Box>
</Flex>

// ❌ 右栏用 minmax(0, 1fr) 却忘了左侧也有 minmax(0, …)：内容宽时左栏撑破
<Grid columns="320px 1fr">
```

**为什么**：

- `1fr` 的默认最小值是 `auto`，内容宽于容器时列会被撑开。**能收缩的列一律写 `minmax(0, 1fr)`**。
- 固定宽度那一侧也用 `minmax(280px, 360px)`：窗口窄时不至于把右侧压没。
- `align="start"` 让两栏顶部对齐；否则高度不等的两栏会被拉平，视觉上「左栏底部一大堆空白」。

---

## 附：模式之外的三条选择规则

写过上面十种模式后，会剩下三类判断。它们不是模式，是**选择规则**：

**① 容器选哪个**

| 需求 | 用 | 不要用 |
|---|---|---|
| 一维排列 + 间距 | `Flex` | `Box` + CSS `display:flex` |
| 二维对齐（列 / 行 / 跨行跨列） | `Grid` | 嵌套三层 `Flex` |
| 只需背景、描边、圆角、裁剪 | `Box` / `Card` | `Flex` |
| 内容最大宽度、居中 | `Container` | `maxWidth` + `mx="auto"` 手搓 |
| 垂直分区（带内边距与分隔） | `Section` | `Box` + `py` |

**② 间距给谁**

- 兄弟之间 → 父容器 `gap`（改一处改全部）
- 容器自己的内边距 → 容器 `p` / `px` / `py`
- 单个元素对外的距离 → 那个元素的 `m*`
- 不要用「子元素的 margin」模拟父容器的 `gap`：最后一个孩子的 margin 会留白。

**③ 语义标签**

`Box` 的 `as` 只支持 `div` / `span`。需要 `<section>` / `<nav>` / `<main>` / `<article>` 时，用 `Section`（`section`）或保留原生标签并写注释，不要用 `Box as="section"`——那个值会被忽略。
