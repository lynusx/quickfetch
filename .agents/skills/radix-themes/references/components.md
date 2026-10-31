# 组件使用规范

## 1. 布局

- 一律使用 `Flex`、`Grid`、`Box`、`Container`、`Section` 做布局，不写裸 `div` + 内联样式。
- 间距用 `gap`、`p`、`m` props（如 `<Flex gap="3" p="4">`），值用 `"1"` ~ `"9"` 令牌，禁止写 `style={{ margin: 13 }}` 这类魔法数字。

```tsx
<Flex direction="column" gap="3" p="4">
  <Box>内容</Box>
</Flex>

<Grid columns="3" gap="4">
  <Card /><Card /><Card />
</Grid>
```

## 2. 排版

- 所有文本必须包在 `Text`、`Heading`、`Code`、`Em`、`Strong` 等排版组件中，通过 `size` / `weight` / `color` props 控制样式，禁止手写 `<span style={...}>`。

```tsx
<Heading size="6" weight="bold">标题</Heading>
<Text size="2" color="gray">辅助说明文字</Text>
<Text>正文包含 <Strong>重点</Strong> 和 <Code>code</Code></Text>
```

## 3. 组件变体

- 变体用 `variant`：`solid`（主操作）、`soft`（次操作）、`outline`、`ghost`（工具栏/弱操作）。
- 尺寸用 `size="1" ~ "4"`，同一上下文内保持一致。
- 颜色用 `color` prop（如 `<Button color="red">删除</Button>`），不要覆盖 CSS。

```tsx
<Flex gap="2">
  <Button variant="solid">保存</Button>
  <Button variant="soft" color="gray">取消</Button>
  <Button variant="outline" color="red">删除</Button>
</Flex>
```

## 4. 表单

- 输入控件用 `TextField.Root` / `Select.Root` / `Checkbox` / `RadioGroup.Root` / `Switch`。
- 标签用 `<Text as="label" size="2">` 并与控件关联。

```tsx
<Flex direction="column" gap="2">
  <Text as="label" size="2" weight="medium">邮箱</Text>
  <TextField.Root placeholder="you@example.com" />
</Flex>

<Select.Root defaultValue="apple">
  <Select.Trigger />
  <Select.Content>
    <Select.Item value="apple">苹果</Select.Item>
  </Select.Content>
</Select.Root>
```

## 5. 弹层

- 模态用 `Dialog.Root` / `AlertDialog.Root`（破坏性操作用后者）。
- 提示用 `Tooltip`——必须配 `IconButton` 或可聚焦元素作为 Trigger。
- 下拉用 `DropdownMenu.Root`，轻量浮层用 `Popover`。

```tsx
<Dialog.Root>
  <Dialog.Trigger><Button>打开</Button></Dialog.Trigger>
  <Dialog.Content maxWidth="450px">
    <Dialog.Title>标题</Dialog.Title>
    <Dialog.Description size="2">描述</Dialog.Description>
    <Flex gap="3" justify="end" mt="4">
      <Dialog.Close><Button variant="soft" color="gray">取消</Button></Dialog.Close>
      <Button>确认</Button>
    </Flex>
  </Dialog.Content>
</Dialog.Root>
```

## 6. 常用组件清单

布局：Box、Flex、Grid、Container、Section、Separator
排版：Text、Heading、Blockquote、Code、Em、Strong、Kbd、Link、Quote
按钮：Button、IconButton、SegmentedControl
表单：TextField、TextArea、Select、Checkbox、CheckboxGroup、RadioGroup、RadioCards、Switch、Slider、SegmentedControl
反馈：Spinner、Progress、Skeleton、Callout、Badge
弹层：Dialog、AlertDialog、Popover、HoverCard、Tooltip、DropdownMenu、ContextMenu
数据展示：Table、DataList、Card、Avatar、AspectRatio、Inset
导航：Tabs、TabNav
其他：ScrollArea、Theme、ThemePanel（仅调试）

> 不确定组件是否存在时，查阅官方文档：https://www.radix-ui.com/themes/docs/components
