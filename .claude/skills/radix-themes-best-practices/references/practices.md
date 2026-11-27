# 最佳实践：选型、组合、效率、验收

本文件按开发顺序回答四个决策问题：**选哪个组件 → 怎么组合与封装 → 怎么写得更省 → 怎么验收**。底层机制与边界判据见 [rules.md](rules.md)，具体拼法见 [components.md](components.md) 与 [layout-patterns.md](layout-patterns.md)。

---

## 1. 选型

动手前依次确认：① 内置 56 组件里已有吗？② 现有组件能组合出来吗？③ 同一组合出现 ≥ 3 次或承载领域语义时才封装。

### 1.1 状态与标签 → `Badge`

- **默认**：`<Badge color="green">已完成</Badge>`（默认已是 `variant="soft"`、`size="1"`，直接省掉）。
- **边界**：`color` 接收 26 个色族，不提供单阶控制；确需特定背景阶位时留 CSS 并注释原因。

### 1.2 说明与警示 → `Callout` vs `Text`

- **默认**：需要醒目区块提示时用 `<Callout.Root color="amber" size="1"><Callout.Icon>…</Callout.Icon><Callout.Text>…</Callout.Text></Callout.Root>`；单句行内辅助提示直接用 `<Text size="1" color="gray">`。

### 1.3 指标数字块 → `Card` + `Text`

- **默认**：`<Card>` 内用 `<Text size="5" weight="bold" className="tabular">` 展示数值，`<Text size="1" color="gray">` 展示标签与单位。
- **边界**：`Card` 内边距由 `size` 控制，局部贴边用 `<Inset>`，不给 `Card` 传 `p`。

### 1.4 布尔、单选与多选

| 场景 | 推荐组件 | 注意点 |
| --- | --- | --- |
| 即时生效的开关 | `Switch` + `<Text as="label">` | 不用于需点击保存才提交的多选 |
| 表单勾选 / 多选集 | `Checkbox` / `CheckboxGroup` | `Checkbox` 支持 `'indeterminate'` 半选态 |
| 少量互斥选项（平铺） | `RadioGroup` | `RadioGroup.Item` 有文本子节点时自动包裹 `<label>` |
| 少量互斥选项（卡片强调） | `RadioCards` / `CheckboxCards` | 窄容器内需显式传 `columns="1"` |
| 行内紧凑视图/筛选切换 | `SegmentedControl` | 每个 `Item` 必传 `value` |

### 1.5 多值枚举选择 → `Select`

- **默认**：选项 ≥ 7 或空间受限时用 `Select.Root` + `<Select.Content position="popper">`；选项 ≤ 6 且需一眼看全用 `RadioGroup` 或 `SegmentedControl`。
- **边界**：`Select` 不含搜索过滤；需可搜索下拉见 [missing-components.md](missing-components.md) 的 Combobox 方案。

### 1.6 页面路由导航 vs 页内面板切换

- **切换不同 URL/路由页面** → `TabNav`（`TabNav.Root` + `TabNav.Link active={...}`）
- **切换同一页面内的内容面板** → `Tabs`（`Tabs.Root` + `List` + `Trigger` + `Content`，带完整 tabpanel 键盘语义）

### 1.7 键值元数据列表 → `DataList`

- **默认**：详情抽屉、配置摘要中的「标签: 值」列表使用 `DataList`（`<dl>/<dt>/<dd>` 语义），通过 `<DataList.Label width="100px" color="gray">` 对齐列宽。

### 1.8 内置库缺失的组件

按三级顺序选型：① 用现有组件组合（如 `Popover` + `TextField` + 列表）；② 参考无样式组合式 API（如 `shadcn/ui` 组件契约拆除 Tailwind 后改用 Radix Primitives + Radix 令牌实现）；③ 引入成熟无头库（`react-day-picker`、`cmdk`、`sonner`、`@tanstack/react-table`）并以 Radix 令牌覆盖外观。详见 [missing-components.md](missing-components.md)。

---

## 2. 组合与封装

### 2.1 组合优于布尔开关

卡片内嵌贴边表格或通栏分隔区时，直接组合 `<Card size="2"><Inset side="x"><Table.Root>…</Table.Root></Inset></Card>`，不为业务容器发明 `flush`、`noPadding` 等布尔配置 prop。

### 2.2 `asChild` 委托宿主元素

需要把按钮或链接外观挂到路由 `<Link>`、原生 `<a>` 或上传 `<label>` 上时，使用外层 `asChild` 并确保**只有唯一一个 React 元素子节点**：

```tsx
<Button asChild variant="soft">
  <RouterLink to="/settings">设置</RouterLink>
</Button>
```

适用与禁用范围见 [components.md §3](components.md#3-aschild-的适用范围与限制)。

### 2.3 封装业务组件的门槛

仅在满足任一条件时抽离组件：**同一组合出现 ≥ 3 次**，或**承载明确领域概念**。禁止无信息量的薄包装（如 `const MyCard = (p) => <Card {...p} />`）。封装组件需保留清晰的领域命名，必要时透传 `className` / `ref`。

### 2.4 构建块组合与显式包裹

布局、文字与成品组件形态冲突时，遵循 [rules.md §2.2](rules.md#22-样式定制的三层裁决) 的三层裁决，用 14 个构建块搭骨架；非布局组件需控制尺寸或弹性时遵循 [rules.md §6.4](rules.md#64-几何尺寸与弹性包裹) 外包 `<Box>` / `<Flex>`。

---

## 3. 效率与简洁

### 3.1 只写偏离默认值的 prop

根节点 `<Theme>` 与各组件均省略默认值（全景表见 [rules.md §7](rules.md#7-不写组件自带的默认值)）：

```tsx
// ✅ 简洁且随主题联动
<Theme appearance="light" grayColor="slate">
<Card><Badge color="green">运行中</Badge></Card>

// ✅ 两类必须显式写的例外：Text 的 size，以及响应式对象的基线与各断点
<Text size="2">正文</Text>
<Heading as="h2" size={{ initial: '3', md: '5' }}>标题</Heading>
```

### 3.2 状态选择器优先复用 `data-*`

展开、选中、禁用样式直接匹配 Radix 原生输出的 `[data-state="open"]`、`[data-disabled]`、`[data-active]`（清单见 [components.md §10](components.md#10-状态样式用哪些属性)），无需额外维护布尔拼接类名。

### 3.3 局部换色优先传组件 `color`

单个按钮或徽标换色直接传 `<Button color="crimson">`；仅当整块区域（背景 + 边框 + 内部多控件）都需切换强调色时，才使用嵌套 `<Theme accentColor="blue" grayColor="auto" asChild>`。

---

## 4. 验收清单

1. **零静默双写与违规声明**：运行 [SKILL.md](../SKILL.md#改后扫描) 中的 6 条 grep 检查，输出为空或每处例外均有注释说明原因。
2. **可访问名称完备**：所有 `<IconButton>` 必有 `aria-label`；裸图标有 `<AccessibleIcon label="…">` 或 `aria-hidden`；`<Dialog.Content>` 必含 `<Dialog.Title>`（视觉隐藏时包 `<VisuallyHidden>`）。
3. **明暗与主题令牌联动**：切换 `light` / `dark` 无残留死色，颜色与圆角全部来自 `var(--accent-*)`、`var(--gray-*)`、`var(--radius-*)`。
4. **最小 CSS 增量**：逐条审视新增 CSS，删掉后 `getComputedStyle` 不变的冗余声明一律清理。
