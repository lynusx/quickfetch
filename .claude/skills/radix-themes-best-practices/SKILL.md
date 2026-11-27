---
name: radix-themes-best-practices
description: 在使用 `@radix-ui/themes` 的 React 项目中编写、迁移、重构或排查 UI 界面时调用：组件选型与组合、布局与排版构建块 props、主题令牌与明暗配置、弹层/表单/表格/滚动区拼装，以及修复双写覆盖、间距失效、文本截断等静默样式缺陷。
---

# Radix Themes 最佳实践（基准 `@radix-ui/themes@3.3+`）

Radix Themes 是「成品组件 + 设计令牌 + 布局与排版构建块」一体的 React UI 库。它最主要的风险在于**静默失败（silent failure）**：prop 被后加载的项目 CSS 覆盖、多值间距档位变成 `0`、遗漏收缩边界导致截断失效——类型检查与控制台均不报错。

本技能的目标是用最少代码**一次写对**：能在 props 表达的布局与排版不写 CSS，外观只引用主题令牌，写完按清单可自检。**五条硬边界与判断 ①–④⑥ 防静默失败，必须遵守**；判断 ⑤、模式与实践为默认推荐，按需偏离时在代码注释写明原因即可。核心术语见 [rules.md §0](references/rules.md#0-核心术语)。

## 核心原则：As-Is 优先与 14 构建块组合

> 官方准则：*“Beyond simple style overrides, we recommend using the components as-is, or create your own versions using the same building blocks.”*

1. **As-Is 原样使用**：成品组件（`Button`、`Card`、`Badge`、`Select`、`Dialog`、`Table` 等）直接使用预设几何尺寸与交互层级，仅通过 `size` / `variant` / `color` / `highContrast` / `radius` 调节，不写 CSS 改写 `.rt-*` 内部结构。
2. **14 构建块自组**：当需求与成品组件预设形态冲突时，用 **14 个构建块**（5 布局 + 9 排版）+ Radix Primitives + 主题令牌组合新组件；需按钮或链接交互时外包 `<Button asChild>` 或 `<Link asChild>`。

| 构建块类型 | 组件清单（14 个） | 原生 Props 职责（唯一真相来源） |
| --- | --- | --- |
| **5 大布局容器** | `Box`, `Flex`, `Grid`, `Container`, `Section` | `display`, `direction`, `gap`/`gapX`/`gapY`, `p`/`px`/`py`/`pt`/`pr`/`pb`/`pl`, `m`/`mx`/`my`/`mt`/`mr`/`mb`/`ml`, `width`/`minWidth`/`maxWidth`, `height`/`minHeight`/`maxHeight`, `flexGrow`/`flexShrink`/`flexBasis`, `align`/`justify`/`alignSelf`/`justifySelf`/`alignContent`/`justifyItems`, `columns`/`rows`/`areas`/`gridArea`/`gridColumn`/`gridRow`/`flow`, `position`/`inset`/`top`/`right`/`bottom`/`left`, `overflow`/`overflowX`/`overflowY` |
| **9 大排版组件** | `Text`, `Heading`, `Link`, `Code`, `Kbd`, `Blockquote`, `Quote`, `Strong`, `Em` | `size`（同步决定字号、行高、字距）、`weight`（`light`/`regular`/`medium`/`bold`）、`color` + `highContrast`（11/12 阶可访问文本色）、`align`（`left`/`center`/`right`）、`trim`（首尾行高修剪）、`truncate`、`wrap`（`wrap`/`nowrap`/`pretty`/`balance`）；等宽文本用 `<Code variant="ghost">` 或 `<Kbd variant="classic" \| "soft">` |

## 五条硬边界

1. **单一主题体系**：全站围绕 `<Theme>` 构建，不混入自带独立主题/重置体系的重型组件库或原子类框架。
2. **外观只用设计令牌**：背景、描边、圆角、阴影引用 `var(--accent-*)`、`var(--gray-*)`、`var(--radius-*)`、`var(--shadow-*)`，不写硬编码 hex / `rgb()` 或固定圆角像素。
3. **先查内置组件再封装**：动手前依次确认：① 56 个内置组件里已有吗？② 能用现有组件组合吗？③ 同一组合出现 ≥ 3 次或承载明确领域语义时才封装业务组件（见 [practices.md §1–2](references/practices.md#1-选型)）。
4. **几何尺寸与弹性归口 5 大布局容器**：非布局组件（`Text`、`Slider`、`Button`、`Badge`、`ScrollArea` 等）只有 `MarginProps`，需要控制宽高、弹性（`flexGrow`/`flexShrink`）或截断边界（`minWidth="0"`）时，外包 `<Box>` / `<Flex>` 通过 props 声明，不在 CSS 类里注入尺寸与弹性（见 [rules.md §6.4](references/rules.md#64-几何尺寸与弹性包裹)）。
5. **可读文本颜色归口 Typography prop**：Radix Colors 中 11/12 阶专为可读文本设计（9/10 阶用于实心背景与图标图形）。正文默认继承 12 阶色，次级文本传 `color="gray"`（11 阶），层级弱化组合 `size="1"` 与 `weight`，不在 CSS 中给普通文本写颜色类（见 [rules.md §5](references/rules.md#5-颜色)）。

## 六条高频判断

### ① props 管布局，CSS 管外观（防双写）

```tsx
// ✅ 方向、间距、尺寸、弹性、对齐、网格列与区域 → props
<Flex direction="column" gap="3" p="4" minWidth="0" overflow="hidden" flexGrow="1">
<Grid columns={{ initial: '1', sm: '2', md: '3' }} gap="3">
```
```css
/* ✅ 边框、背景、阴影、伪类、[data-state]、相邻选择器、repeat(auto-fill, ...) → CSS */
.panel { border: 1px solid var(--gray-a5); background: var(--gray-1); }
.panel:hover { border-color: var(--gray-a7); }
```

同一属性同时写在 props 与项目 CSS 时，后加载的项目 CSS 会**静默吃掉 prop**（`double-write`）。机制与分工边界见 [rules.md §1–2](references/rules.md#1-样式的五层来源与优先级)。

### ② 文字进 Typography，颜色与等宽走组件能力

```tsx
<Flex direction="column" gap="1">
  <Text size="2" weight="medium">{title}</Text>
  <Text size="1" color="gray">{description}</Text>
  <Code size="1" variant="ghost" color="gray" truncate>{filePath}</Code>
</Flex>
```

容器不替文字设 `color` / `text-align` / `font-family`；路径、哈希、编号需要纯文本等宽时直接用 `<Code variant="ghost">`，详见 [rules.md §4](references/rules.md#4-typography-排版能力)。

### ③ 字号只从 `size` 派生

`size` 一次性同步下发 `font-size`、`line-height`、`letter-spacing`。CSS 手写其中任一项都会造成半覆盖错位；字重统一用 `weight`。排查见 [pitfalls.md §3](references/pitfalls.md#3-字号不对--行高怪--字距乱)。

### ④ 间距档位传单值，响应式必写 `initial`

```tsx
// ❌ p="2 4" 会展开为无单位 padding: 2 4，被浏览器整条丢弃成 0
// ❌ columns={{ base: '1', md: '3' }} 中 base 不存在，移动端基线丢失
// ✅ 拆方向 prop；响应式以 initial 起步
<Box py="2" px="4" />
<Grid columns={{ initial: '1', md: '3' }} gap="3" />
```

详见 [rules.md §3.3–3.4](references/rules.md#33-间距-prop-不接多值简写)。

### ⑤ 只写偏离默认值的 prop（留意两类例外）

```tsx
<Theme appearance="light" grayColor="slate">   {/* 省略默认 accentColor="indigo" / radius="medium" / scaling="100%" */}
<Card><Badge color="green">已完成</Badge></Card> {/* Card 默认 surface/size 1；Badge 默认 soft/size 1 */}
```

- **必写例外 1**：`<Text>` **没有默认 `size`**（不写会继承父级字号），必须显式传 `size`。
- **必写例外 2**：注意核实真实默认值——例如 `<ScrollArea>` 默认是 `size="1"` + `type="hover"`，桌面常驻自动滚动条需显式写 `type="auto"`，主视口加粗需写 `size="2"`。全量默认值表见 [rules.md §7](references/rules.md#7-不写组件自带的默认值)。

### ⑥ 组件页 API 表只列新增 prop，别漏查继承面

`Dialog`、`Select`、`Popover`、`DropdownMenu`、`Tooltip`、`ScrollArea` 等 22 个组件继承底层 Radix Primitive 的完整交互 prop（如 `onEscapeKeyDown`、`open`/`onOpenChange`、`side`/`sideOffset`、`type`），直接传 prop 即可，无需手写全局 `keydown` 或定位逻辑。完整继承表见 [components.md §11](references/components.md#11-继承-prop-面)。

## 最小正确模板

更多场景模板见 [layout-patterns.md](references/layout-patterns.md)。

### 表单行（贯穿分隔线）

```tsx
<Flex direction="column">
  {rows.map((row) => (
    <Flex key={row.id} className="form-row" align="center" gap="3" py="3">
      <Flex direction="column" gap="1" minWidth="0" flexGrow="1">
        <Text size="2" weight="medium" truncate>{row.label}</Text>
        <Text size="1" color="gray" truncate>{row.hint}</Text>
      </Flex>
      <Switch checked={row.on} onCheckedChange={(v) => setOn(row.id, v)} />
    </Flex>
  ))}
</Flex>
```
```css
.form-row + .form-row { border-top: 1px solid var(--gray-a5); }
```

### 可截断列表项（每层 `minWidth="0"`，固定项外包 `flexShrink="0"`）

```tsx
<Flex align="center" gap="3" py="2" width="100%">
  <Avatar size="1" fallback="Z" />
  <Flex direction="column" minWidth="0" flexGrow="1">
    <Text size="2" truncate>{item.name}</Text>
    <Code size="1" variant="ghost" color="gray" truncate>{item.path}</Code>
  </Flex>
  <Box flexShrink="0"><Badge color={item.tone}>{item.status}</Badge></Box>
</Flex>
```

### 弹窗骨架（`Dialog.Title` 必填，破坏性确认改用 `AlertDialog`）

```tsx
<Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Trigger><Button>编辑</Button></Dialog.Trigger>
  <Dialog.Content maxWidth="480px">
    <Dialog.Title>编辑资料</Dialog.Title>
    <Dialog.Description size="2" color="gray">改动保存后立即生效。</Dialog.Description>
    <Flex direction="column" gap="3" mt="4">
      <TextField.Root value={name} onChange={(e) => setName(e.target.value)} />
    </Flex>
    <Flex gap="3" mt="4" justify="end">
      <Dialog.Close><Button variant="soft" color="gray">取消</Button></Dialog.Close>
      <Dialog.Close><Button onClick={save}>保存</Button></Dialog.Close>
    </Flex>
  </Dialog.Content>
</Dialog.Root>
```

## 按需查阅与三层核实

前一层能确认就不下沉；三层均无法核实时不猜 API，改用已确认写法并留注释说明。

1. **先查本技能参考文档**：

| 你要解决的问题 | 阅读文件 |
| --- | --- |
| props/CSS 边界、尺度档位、排版/颜色/包裹规则、默认值与合法 CSS 例外 | [rules.md](references/rules.md) |
| 组件选型、何时封装业务组件、效率与无障碍验收 | [practices.md](references/practices.md) |
| 页面骨架、工具栏、网格、表单行、列表项、弹窗、分栏等 13 种拼法 | [layout-patterns.md](references/layout-patterns.md) |
| 点号子组件必填项、`asChild` 边界、受控表单、表格、22 组件继承 prop 面 | [components.md](references/components.md) |
| `<Theme>` 开关、`radius`/`scaling` 像素表、断点、光标令牌、嵌套主题 | [theming.md](references/theming.md) |
| 样式不生效、padding 变 0、截断失效、下拉遮挡等 21 类症状排障 | [pitfalls.md](references/pitfalls.md) |
| DatePicker、Combobox、Drawer、Toast 等缺失组件的无头库/API 移植方案 | [missing-components.md](references/missing-components.md) |

2. **再查本地 `node_modules/@radix-ui/themes`**（反映项目真实锁定的版本）：
   ```bash
   node -p "require('@radix-ui/themes/package.json').version"
   grep -E '^\s{2}[a-zA-Z]+:' node_modules/@radix-ui/themes/src/components/scroll-area.props.tsx
   ```
   若包内无 `src/`，改查 `dist/**/*.d.ts`（见 [components.md §11.6](references/components.md#116-怎么自己确认三种情况)）。

3. **最后查官方文档 `.md` 镜像**：[llms.txt](references/llms.txt) 收录 70 个官方 `.md` 直链；确认组件全集看 `https://www.radix-ui.com/themes/docs/components.md`（56 个）。文档站对应最新版，与本地不一致时以本地源码/类型为准。

## 改前与改后自检

### 改前确认
- [ ] 同一元素上没有同时通过 props（`.rt-r-*`）与自定义 CSS 类声明同一属性
- [ ] 非布局组件需要尺寸、弹性或收缩截断时，已用 `<Box>` / `<Flex>` 显式包裹
- [ ] 间距档位为单值（多值已拆 `px`/`py`），响应式对象包含 `initial`
- [ ] `Tooltip` 包裹 `disabled` 按钮时，外层已套带 `tabIndex={0}` 的非禁用元素（见 [pitfalls.md §12](references/pitfalls.md#12-tooltip-悬浮在-disabled-元素上不出现)）

### 改后扫描

```bash
# ① 间距档位多值（有输出即为静默归零 bug）
grep -rnE '\b(p|px|py|pt|pr|pb|pl)="[^"]*[0-9] +[0-9]' src --include=*.tsx
# ② 手写字号与字距（除注释豁免的第三方 DOM 覆盖层外不应有输出）
grep -rnE '^\s*(font-size|letter-spacing)\s*:' src --include=*.css
# ③ 硬编码颜色
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src --include=*.css --include=*.tsx
# ④ 裸布局/排版标签（逐处核实是否语义必需）
grep -rnE '<(div|span|p|h[1-6])\b' src --include=*.tsx
# ⑤ 错误的响应式 base 键名
grep -rnE '\{\{[^}]*\bbase\s*:' src --include=*.tsx
# ⑥ CSS 布局属性泄漏（核实是否应改由 Box/Flex props 承担）
grep -rnE '^\s*(min-width|max-width|flex|flex-grow|flex-shrink|flex-basis)\s*:' src --include=*.css
```

跑完上述扫描后，执行宿主项目的 `typecheck`、`lint`、`format` 与 `build`。

## 新项目接入与门禁模板

```tsx
// 入口文件：Radix 样式表必须在项目自定义样式之前引入
import '@radix-ui/themes/styles.css'
import './index.css'
```

- 图标库可按项目约定选用 `lucide-react` 或 `@radix-ui/react-icons`（全项目统一一套即可）。
- 全应用保持唯一根 `<Theme>`，上线前移除调试用的 `<ThemePanel />`。
- 若需将防双写检查固化进构建门禁，可按需复用 [templates/.stylelintrc.mjs](templates/.stylelintrc.mjs)、[templates/ci.yml](templates/ci.yml) 与 [templates/AGENTS.snippet.md](templates/AGENTS.snippet.md)。
