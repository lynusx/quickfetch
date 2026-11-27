# 布局模式：工具与后台界面的十三种拼法

本文件提供 13 种高频界面结构的最小正确拼法（基准 `@radix-ui/themes@3.3+`）。规则依据见 [rules.md](rules.md)，选型判据见 [practices.md](practices.md)，症状排查见 [pitfalls.md](pitfalls.md)。

## 目录

| # | 模式 | 适用场景 |
| --- | --- | --- |
| 1 | 页面骨架 | 侧栏 + 独立纵向滚动主视口 |
| 2 | 工具栏 | 左侧操作组 + 弹性占位 + 右侧统计/切换 |
| 3 | 卡片网格 | 响应式等宽卡片或定宽+自适应列 |
| 4 | 表单行 | 左标签说明 + 右控件 + 贯穿分隔线 |
| 5 | 列表项 | 图标 + 双行可截断文本 + 尾部徽标与动作 |
| 6 | 空态 | 居中图标 + 标题说明 + 引导操作 |
| 7 | 统计块 | 等宽大数字 + 单位 + 标签 |
| 8 | 滚动面板 | 局部限高或占满剩余空间的独立滚动区 |
| 9 | 弹窗 | 标准表单弹窗与破坏性确认 |
| 10 | 分栏 | 左列表 + 右详情双栏自适应 |
| 11 | 属性与元数据列表 | `DataList` 键值对对齐与响应式折叠 |
| 12 | 零抖动骨架屏与原地加载 | `Skeleton` 与 `Spinner` 原地包裹 |
| 13 | 叶子组件尺寸与弹性包裹 | `Slider`、`Code`、`ScrollArea`、`Badge` 外包容器 |

---

## 1. 页面骨架

```tsx
<Flex direction="column" width="100vw" height="100vh" overflow="hidden">
  <Flex flexGrow="1" flexBasis="0" minHeight="0" overflow="hidden">
    <Sidebar />
    <Flex direction="column" flexGrow="1" flexBasis="0" minWidth="0" overflow="hidden">
      {/* ScrollArea 不接 LayoutProps，用 style={{ flexGrow: 1 }} 撑满剩余高度 */}
      <ScrollArea type="auto" size="2" scrollbars="vertical" style={{ flexGrow: 1 }}>
        <Box px="4" py="4">
          <Heading as="h1" size="4" mb="4">页面标题</Heading>
          {children}
        </Box>
      </ScrollArea>
    </Flex>
  </Flex>
</Flex>
```

- `flexGrow="1" flexBasis="0" minHeight="0"` 缺一不可：漏掉 `minHeight="0"` 会让内容撑破父容器导致外层失控。
- 单页保持唯一 `h1`，面板标题使用 `as="h2"` / `as="h3"`。

---

## 2. 工具栏

```tsx
<Flex align="center" gap="2" wrap="wrap" py="2" px="3">
  <Button variant="soft" onClick={refresh}>刷新</Button>
  <Button variant="ghost" color="gray" onClick={exportAll}>导出</Button>
  <Box flexGrow="1" minWidth="0" />
  <Text size="1" color="gray" className="tabular">{count} 条</Text>
  <SegmentedControl.Root value={filter} onValueChange={setFilter}>
    <SegmentedControl.Item value="all">全部</SegmentedControl.Item>
    <SegmentedControl.Item value="failed">异常</SegmentedControl.Item>
  </SegmentedControl.Root>
</Flex>
```

- 超过两个元素时用 `<Box flexGrow="1" />` 把左右两组自然推开（优于 `justify="between"` 的全员均分），配 `wrap="wrap"` 防窄屏溢出。

---

## 3. 卡片网格

```tsx
<Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="3">
  {items.map((item) => (
    <Card key={item.id}>
      <Flex direction="column" gap="2">
        <Heading as="h3" size="2" trim="both">{item.title}</Heading>
        <Text as="p" size="1" color="gray">{item.description}</Text>
      </Flex>
    </Card>
  ))}
</Grid>

{/* 命名网格区域（3.1+ 原生支持 areas 与 gridArea） */}
<Grid areas={{ initial: '"nav" "main"', md: '"nav main"' }} columns={{ initial: '1', md: '240px minmax(0, 1fr)' }} gap="4">
  <Box gridArea="nav">{nav}</Box>
  <Box gridArea="main" minWidth="0">{main}</Box>
</Grid>
```

- `columns` 只传字符串（`"3"` 自动解析为 `repeat(3, minmax(0, 1fr))`），不传数字 `{3}`。

---

## 4. 表单行

```tsx
<Flex className="form-row" align="center" justify="between" gap="5" minHeight="52px" py="2" px="4">
  <Flex direction="column" gap="1" minWidth="0" flexBasis="0" flexGrow="1" maxWidth="60%">
    <Text as="p" size="2" weight="medium">{label}</Text>
    {description ? <Text as="p" size="1" color="gray">{description}</Text> : null}
  </Flex>
  <Box flexShrink="0">{control}</Box>
</Flex>
```
```css
.form-row + .form-row { border-top: 1px solid var(--gray-a5); }
```

- 行间分隔线用相邻兄弟 `border-top` 画在行自身上，可完整贯穿容器且不受父级 `gap` 打断。

---

## 5. 列表项（完整截断与不压缩包裹）

```tsx
<Flex align="center" gap="2" py="2" px="3">
  <Box flexShrink="0" className="row-icon">{icon}</Box>
  <Flex direction="column" minWidth="0" flexGrow="1">
    <Text size="2" truncate>{name}</Text>
    <Code size="1" variant="ghost" color="gray" truncate>{path}</Code>
  </Flex>
  <Box flexShrink="0"><Badge color={badgeColor}>{status}</Badge></Box>
  <Box flexShrink="0">
    <IconButton variant="ghost" color="gray" aria-label="更多操作">{moreIcon}</IconButton>
  </Box>
</Flex>
```

- `Badge` 与 `IconButton` 自身无 `flexShrink` prop，外包 `<Box flexShrink="0">` 防止被长文本挤压变形；中间层必带 `minWidth="0"` 才能激活内部 `truncate`。

---

## 6. 空态

```tsx
<Flex direction="column" align="center" justify="center" gap="2" py="6" px="4">
  <Flex align="center" justify="center" width="40px" height="40px" mb="1" className="empty-icon">
    {icon}
  </Flex>
  <Text as="p" size="2" weight="medium" align="center">{title}</Text>
  <Text as="p" size="1" color="gray" align="center">{description}</Text>
  {action ? <Box mt="2">{action}</Box> : null}
</Flex>
```
```css
/* 仅装饰图标使用 9 阶色；文字仍保持 12 阶默认与 11 阶 color="gray" */
.empty-icon { color: var(--gray-9); }
```

---

## 7. 统计块

```tsx
const TONE_COLOR = { default: undefined, accent: 'indigo', success: 'green', danger: 'red' } as const

<Card size="2">
  <Flex direction="column" gap="1" minWidth="0">
    <Text as="div" size="1" color="gray">{label}</Text>
    <Text as="div" size="5" weight="bold" color={TONE_COLOR[tone]} truncate className="tabular">
      {value}
      {unit ? <Text size="1" weight="regular" color="gray" ml="1">{unit}</Text> : null}
    </Text>
  </Flex>
</Card>
```
```css
.tabular { font-variant-numeric: tabular-nums; }
```

- 标签与单位统一通过 `size="1"` + `color="gray"`（11 阶）拉开主次层级，可读文本不使用 9/10 阶色；业务语气在 TSX 中直接映射为 `color` prop。

---

## 8. 滚动面板

```tsx
<Flex direction="column" height="100%" minHeight="0" overflow="hidden">
  <Flex align="center" justify="between" py="2" px="3">
    <Text size="2" weight="medium">{title}</Text>
  </Flex>
  <ScrollArea type="auto" scrollbars="vertical" style={{ flexGrow: 1 }}>
    <Box p="3">{items.map((item) => <Row key={item.id} item={item} />)}</Box>
  </ScrollArea>
</Flex>
```

- `ScrollArea` 默认 `size="1"`（紧凑 4px 轨道），局部面板无需重复写 `size="1"`；需要溢出自动显示滚动条时显式传 `type="auto"`（默认是 `'hover'`）。

---

## 9. 弹窗

- 普通编辑/查看弹窗用 `Dialog`（无 `Description` 时给 `Dialog.Content` 传 `aria-describedby={undefined}`，且必含 `Dialog.Title`）；
- 删除、清空、重置等破坏性确认改用 `AlertDialog`（见 [components.md §2](components.md#2-点号子组件的必填项)）。

---

## 10. 分栏

```tsx
<Grid columns={{ initial: '1', md: 'minmax(260px, 340px) minmax(0, 1fr)' }} gap="4" align="start">
  <Card>
    <Box maxHeight="480px">
      <ScrollArea type="auto" scrollbars="vertical">
        <Box p="2">{list}</Box>
      </ScrollArea>
    </Box>
  </Card>
  <Card>
    <Box p="2">{detail}</Box>
  </Card>
</Grid>
```

- 自适应列写 `minmax(0, 1fr)`（纯 `1fr` 默认最小宽度为 `auto`，遇到长路径或宽表会撑破网格）。

---

## 11. 属性与元数据列表

```tsx
<Card>
  <DataList.Root orientation={{ initial: 'vertical', sm: 'horizontal' }}>
    <DataList.Item align="center">
      <DataList.Label width="100px" color="gray">状态</DataList.Label>
      <DataList.Value><Badge color="green">运行中</Badge></DataList.Value>
    </DataList.Item>
    <DataList.Item align="center">
      <DataList.Label width="100px" color="gray">输出目录</DataList.Label>
      <DataList.Value><Code size="1" variant="ghost" truncate>/var/data/output</Code></DataList.Value>
    </DataList.Item>
  </DataList.Root>
</Card>
```

---

## 12. 零抖动骨架屏与原地加载

```tsx
<Card>
  <Flex direction="column" gap="3">
    <Skeleton loading={isLoading}>
      <Heading as="h3" size="3" trim="both">{data?.title ?? '占位标题文本'}</Heading>
    </Skeleton>
    <Skeleton loading={isLoading}>
      <Text size="2" color="gray">{data?.summary ?? '占位摘要说明文本'}</Text>
    </Skeleton>
    <Flex justify="end">
      <Spinner loading={isSubmitting}>
        <Button onClick={submit} disabled={isLoading}>保存配置</Button>
      </Spinner>
    </Flex>
  </Flex>
</Card>
```

---

## 13. 叶子组件尺寸与弹性包裹

```tsx
{/* A. Slider 占满行内剩余宽度 + 右侧定宽数值 */}
<Flex align="center" gap="4">
  <Text size="2">并发上限</Text>
  <Box flexGrow="1" flexShrink="1" flexBasis="0" minWidth="0">
    <Slider value={[val]} min={1} max={16} onValueChange={([v]) => setVal(v)} />
  </Box>
  <Box flexShrink="0" minWidth="32px">
    <Text size="2" weight="medium" align="right" className="tabular">{val}</Text>
  </Box>
</Flex>

{/* B. Badge 内部长状态名限宽截断（Badge 自身无 truncate/maxWidth prop，组合 Box + Text truncate） */}
<Box maxWidth="120px" minWidth="0" ml="auto">
  <Badge color="blue">
    <Text size="1" truncate>{status}</Text>
  </Badge>
</Box>
```

---

## 附：写完上面十三种模式后的三条通则

1. **选容器**：一维排布用 `Flex`，二维对齐与区域划分用 `Grid`，纯尺寸/内边距/裁剪包裹用 `Box`，版心限宽居中用 `Container`，页面大段留白分区用 `Section`。
2. **给间距**：同级元素间距优先给父容器 `gap`，容器内留白给容器 `p`/`px`/`py`，仅单元素局部偏移用 `m*`。
3. **语义宿主**：`Box` 的 `as` 只接 `"div" | "span"`；`<nav>` / `<main>` / `<article>` 等地标语义保留原生标签承载，内部布局仍交由构建块完成。
