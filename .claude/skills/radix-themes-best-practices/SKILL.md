---
name: radix-themes-best-practices
description: 在依赖 `@radix-ui/themes` 的项目里写 UI 时用：选组件、props 与 CSS 的分工、配主题、拼弹层表单表格、排查样式不生效。覆盖新建、迁移、简化、排错四种动作；最佳实践按默认推荐给出，允许按需偏离，防静默失败的正确性规则必须遵守。不适用于 shadcn/ui、Tailwind、MUI、Ant Design 等自带主题体系的库，以及只用 `@radix-ui/primitives` 裸包的项目。
---

# Radix Themes 最佳实践

Radix Themes 是「组件 + 设计令牌 + 布局工具类」一体的 React UI 库。它的大部分坑不在于 API 难用，而在于**错误是静默的**：prop 被 CSS 覆盖、间距变成 0、列数直接丢失——都不报错。

这份 skill 的目标是让你用最少的代码**一次写对**，并交出简单、高效、可维护的布局：简单 = 不造抽象、不写覆盖；高效 = 能在 props 里表达的不写 CSS；可维护 = 复用组件与令牌、不留例外。写完能自检，出问题能自己查。

内容分两层：**五条红线与六条判断①–④⑥防的是静默失败，必须遵守**；其余内容（判断⑤、实践、模式、清单）是**默认推荐**——可以偏离，在注释里写明理由即可。[references/](references/) 按需读，[GLOSSARY.md](GLOSSARY.md) 是唯一术语来源。

## 核心原则：As-Is 原则与 14 构建块主权（Beyond Simple Overrides）

> **官方最高准则**：*“Beyond simple style overrides, we recommend using the components as-is, or create your own versions using the same building blocks.”*

Radix Themes 的核心哲学是**拒绝暴力覆盖**。面对任何界面需求，永远只有两条正道：
1. **As-Is 原则（原样使用）**：全盘接受成品组件（`Button`、`Card`、`Badge`、`Select` 等）预设的几何高度、内边距与交互层级，仅通过其声明的 props（`size` / `variant` / `color` / `highContrast` / `radius`）调节，绝不写 CSS 强扭内部 `.rt-*` 样式。
2. **构建块从零自组（Building Blocks Composition）**：当需求与成品组件预设形态根本冲突时，**严禁写 CSS 暴力覆写**，而是直接使用 **14 个原子构建块**（5 布局 + 9 排版）+ Radix Primitives + 主题令牌从零装配专属组件；需要按键/链接行为时外包 `<Button asChild>` 或 `<Link asChild>`。

### 14 基础构建块能力主权表（Building Blocks Sovereignty Table）

这 14 个基础构建块原生提供的排版与布局 props 是**第一且唯一的真相来源**，绝对禁止绕过 props 在 CSS 中另起炉灶：

| 构建块类型 | 组件清单（14 个） | 原生能力全集（走 Props） | CSS 绝对禁区（严禁手写 CSS） |
| --- | --- | --- | --- |
| **5 大布局容器** | `Box`, `Flex`, `Grid`, `Container`, `Section` | `display`, `direction`, `gap`, `p`/`px`/`py`, `m`/`mx`/`my`, `align`, `justify`, `columns`, `rows`, `minWidth`, `maxWidth`, `overflow`, `flexGrow`, `flexShrink`, `flexBasis`, `position`, `inset` | 严禁在 CSS 中声明 `margin` / `padding` / `display: flex/grid` / `gap` / `flex` 比例 / `columns` |
| **9 大排版组件** | `Text`, `Heading`, `Link`, `Code`, `Kbd`, `Blockquote`, `Quote`, `Strong`, `Em` | • **`size` 三件套**：同时下发 font-size、line-height 与 letter-spacing<br>• **`font-family` 预设**：`Text`/`Heading` 默认常规无衬线；`Code`/`Kbd` **原生自带等宽**（`--code-font-family`）<br>• **`weight`**：字重（`light`/`regular`/`medium`/`bold`）<br>• **`color` / `highContrast`**：颜色阶梯（12 阶基准、11 阶次级）<br>• **`align`**：对齐（`left`/`center`/`right`）<br>• **`trim`**：行高留白修剪（`normal`/`start`/`end`/`both`）<br>• **`truncate` / `wrap`**：省略截断与折行平衡 | **严禁在 CSS 中声明 `font-size`、`line-height`、`letter-spacing`、`font-family`、`text-align`**，以及 11/12 阶的 `color` |

## 五条红线

生成代码时不得出现：

1. ❌ 混入 shadcn/ui、Tailwind、MUI、Ant Design 等**自带主题体系**的库——它们与 `<Theme>` 互不感知，主题色与明暗模式都不会联动
2. ❌ 手写 hex / rgb 颜色——用令牌 `var(--accent-9)`、`var(--gray-a3)`
3. ❌ 手搓已有组件——`Card`、`Badge`、`ScrollArea`、`Table`、`Separator`、`Callout`、`Progress` 全部都有
4. ❌ 绕过 5 大布局容器在 CSS 中向叶子组件（`Text`、`Slider`、`Button`、`Badge` 等）书写布局声明（如 `width`、`min-width`、`max-width`、`flex`、`overflow` 等）——几何尺寸与弹性由 `Box`、`Flex`、`Grid`、`Container`、`Section` 承担，叶子组件通过外层 `Box` / `Flex` 显式包裹控制
5. ❌ 绕过 Typography（`Text`、`Heading`、`Link`、`Code`）的 `color` / `highContrast` prop 在 CSS 中向文本书写颜色——在 Radix Colors 规范中，11/12 阶是唯二专为排版文本设计的「Accessible text」梯队，9/10 阶专属于 Solid 实体背景。严禁向文本赋予 9/10 阶颜色（会导致 WCAG AA 对比度不达标并造成 CSS 泄漏）；弱化层级通过 `size="1"`、字重（如标题 `medium`/`bold` 对比正文 `regular` 或需要极弱时用 `light`）与 `color="gray"` 建立。

## 选型三问

写 UI 前按顺序问：① 库里有现成组件吗？② 能组合出来吗？③ 必须自己封吗（同组合 ≥ 3 次，或要承载领域语义）？
跨过前两问直接封，往往就是手搓组件的开始。判据、反例与代价见 [practices.md](references/practices.md)。

## 六条判断

这六条挡掉绝大部分错误。每条给「怎么做」和「为什么」。

### ① props 管布局，CSS 管外观

```tsx
// ✅ 方向、间距、尺寸、对齐、overflow、flex 比例、网格列数与模板 → props
<Flex direction="column" gap="3" p="4" minWidth="0" overflow="hidden" flexGrow="1">
<Grid columns="3" gap="2">
<Grid columns={{ initial: '1', sm: '2', md: '3' }} gap="3">
```
```css
/* ✅ 边框、背景、阴影、伪类、后代选择器、特殊高级模板（如 repeat(auto-fill, ...)） → CSS */
.panel { border: 1px solid var(--gray-a5); background: var(--gray-1); }
.panel:hover { border-color: var(--gray-a7); }
```

**为什么**：同一个属性写两处时，项目 CSS 后加载会**静默吃掉 prop**，改 prop 没有任何反应，而类型检查不会报错。这就是 `double-write（双写）`——本 skill 的首要失败模式。网格列模板优先用 `Grid columns` prop，只有 `repeat(auto-fill, ...)` 等少数高级语法才留 CSS。机制与五层来源见 [rules.md §1](references/rules.md#1-样式的五层来源与优先级)。

**注意**：Radix Themes 库中**仅有 5 个基础布局组件**（`Box`、`Flex`、`Grid`、`Container`、`Section`）实现了 `LayoutProps`（尺寸、弹性、定位、溢出与对齐）。`Text`、`Slider`、`Button` 等非布局组件仅有 `MarginProps`，严禁通过给它们写自定义 CSS 类来注入 `min-width`、`max-width`、`flex` 或 `width`——必须在外层套 `Box` 或 `Flex` 并传 props 控制。详见 [rules.md §3.4](references/rules.md#34-几何边界与尺寸包裹原则layout-bounding--geometry-wrappers)。

布局与文字先由 **14 个 `building block（构建块）`** 承担（5 布局 + 9 排版）；CSS 只写它们表达不了的三类，见 [practices.md §2.7](references/practices.md#27-用-14-个构建块搭界面css-是例外)。

### ② 文字进 `Text` / `Heading`，颜色走 prop

```tsx
// ❌
<Flex color="var(--gray-10)">一段说明</Flex>
// ❌ 绕过 prop 去写 CSS 覆盖 11/12 阶颜色或重复默认色
<Text size="1" className="help-text">说明</Text>
/* .help-text { color: var(--gray-11); } 或 color: var(--gray-12); */

// ✅ 12 阶基准色开箱即用（无需 CSS/prop），11 阶次级色走 color prop
<Flex><Text size="1" color="gray">一段说明</Text></Flex>
```

**为什么**：`color` / `weight` / `size` / `align` 是排版语义，只有排版组件有对应 prop；容器替文字做样式，一旦有多个子节点就分不清谁该是什么颜色。同时，Typography 已内置 12 阶基准色（默认）与 11 阶次级色（`color="gray"`），绕过它们在 CSS 里声明颜色会导致类名泄漏与双写（见 [rules.md §5](references/rules.md#5-颜色)）。

### ③ 字号只从 `size`

```tsx
// ❌
<Text size="2" className="row-label">…</Text>
```
```css
.row-label { font-size: 12.5px; line-height: 1.4; }   /* 只覆盖一半，行高还是 size 的 */
```

**为什么**：`size` 一次设三件套（字号 / 行高 / 字距）。字重走 `weight`。→ [pitfalls.md §3](references/pitfalls.md#3-字号不对--行高怪--字距乱)

### ④ 间距是单个档位 `"0"`–`"9"`，多值必须拆方向

```tsx
// ❌ 静默变成 padding: 0
<Box p="2 4" />
// ✅
<Box py="2" px="4" />
<Box p="16px 8px" />   {/* 带单位的合法 CSS 简写可以用 */}
```

**为什么**：`p="2 4"` 被原样写进 `--p: 2 4`，展开成 `padding: 2 4`——缺单位、整条声明被浏览器丢弃。
响应式对象（`columns={{ initial: '1', md: '3' }}`）必须以 `initial` 为基准，**严禁写 `base`**。→ [rules.md §3.4](references/rules.md#34-响应式-prop-语法与断点规则)

### ⑤ 只写偏离默认值的 prop

```tsx
<Theme appearance="light" grayColor="slate">   {/* 主题：只在根节点配一次，只写偏离项 */}
<Badge>已完成</Badge>                           {/* 组件：不写 size="1" / variant="soft" */}
```

**为什么**：`accentColor="indigo"` / `radius="medium"` / `scaling="100%"` / `size="2"` 都是默认值，写了只是噪音；主题后代再写一遍等于开第二个开关。→ [theming.md](references/theming.md)

**例外**：`Text` 没有默认 `size`，不写等于**继承父级字号**（不是取默认），所以必须写。判据与另一类例外（响应式对象）见 [practices.md §3.2](references/practices.md#32-只写偏离默认值的-prop)。

### ⑥ Themes 的 prop 表不是全集

组件页上的表**只列组件层新增的 prop**。Dialog、Select、Popover、DropdownMenu、Tooltip、ScrollArea 等 22 个组件还继承底层 primitive 的 prop，继承来的不在表上：

```tsx
// ✅ 这些都能用，页面没写不代表没有
<Dialog.Content onEscapeKeyDown={(e) => confirmDiscard(e)} />
<Dialog.Root open={open} onOpenChange={setOpen} />
<Tooltip content="刷新" side="bottom" sideOffset={4} />
<ScrollArea type="scroll">…</ScrollArea>
```

**为什么**：把「页面没写」读成「库不支持」，就会用 `useEffect` 监听 Esc、手写定位计算来重实现——又是一个静默失败。完整清单（22 个继承 / 26 个不继承 / 三种变体 / margin props 的适用范围）与自查方法见 [components.md §11](references/components.md#11-继承-prop-面)。

## 最小正确模板

照抄，然后只改数据。模板之外的写法先看 [layout-patterns.md](references/layout-patterns.md)。

### 表单行

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
/* 只留 props 表达不了的：相邻行分隔线，画在行上 */
.form-row + .form-row { border-top: 1px solid var(--gray-a5); }
```

### 可截断列表项

```tsx
<Flex align="center" gap="3" py="2" width="100%">
  <Avatar size="1" fallback="Z" />
  <Flex direction="column" gap="0" minWidth="0" flexGrow="1">
    <Text size="2" truncate>{item.name}</Text>
    <Text size="1" color="gray" truncate>{item.path}</Text>
  </Flex>
  <Box flexShrink="0"><Badge variant="soft" color={item.tone}>{item.status}</Badge></Box>
</Flex>
```

截断链**每一层**都要 `minWidth="0"`，固定元素给 `flexShrink="0"`。断在哪一层，就在哪一层失效。

### 弹窗骨架

```tsx
<Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Trigger><Button>编辑</Button></Dialog.Trigger>
  <Dialog.Content size="3" maxWidth="480px">
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

`Title` 是事实必需（缺了读屏只念「dialog」）。破坏性操作换 `AlertDialog`，取消键包在 `Cancel` 里。

## 不确定时去哪查：三层，从上到下

**前一层能答就不下沉**。三层都不通时不要猜——改写成能确认的写法，并在注释里写明「未核实」。

### ① 本 skill 自带的事实（最省，先查这里）

| 想知道 | 在哪 |
|---|---|
| 有哪些组件 | 本文件三条红线 + [components.md §1](references/components.md#1-先看清-api-形态) |
| 点号组件缺了哪个部件会坏 | [components.md §2](references/components.md#2-点号子组件的必填项) |
| 某个组件还继承了什么 prop | [components.md §11](references/components.md#11-继承-prop-面) |
| 间距 / 字号 / 圆角的像素值 | [theming.md §8](references/theming.md#8-令牌速查) |
| 没有某个组件（DatePicker 等） | [missing-components.md](references/missing-components.md) |

### ② 本地 `node_modules`（有依赖就能用，最准）

```bash
# 项目实际锁的版本
node -p "require('@radix-ui/themes/package.json').version"

# 某个组件的 prop 定义表（每条是 { type, values, default, responsive }）
grep -E '^\s{2}[a-zA-Z]+: \{' node_modules/@radix-ui/themes/src/components/scroll-area.props.tsx
```

`values` 是合法取值，`default` 是默认值，`responsive: true` 表示能接断点对象；`...radiusPropDef` 这类展开在 `src/props/` 下。`src/` 不可用时改读 `.d.ts` 里的继承来源，命令见 [components.md §11.6](references/components.md#116-怎么自己确认三种情况)。

### ③ 官方文档 `.md`（有网时用）

[llms.txt](references/llms.txt) 收录 **70 个 Themes 文档页**的 `.md` 直链——纯正文，组件页含 `Prop / Type / Default` 表（只列组件层新增的 prop，继承来的在 API Reference 首句的 primitive 链接里，那是 **prop 源**）。确认**组件是否存在、干什么用**时，先看 Themes 组件导航页（56 个，每条一句用途）：`https://www.radix-ui.com/themes/docs/components.md`——导航页是全集，可据此判定「没有」；本文件只用于定位文档页与分组，漏了不代表不存在。分组与官方文档侧边栏一致（组标题用官方英文名，组内顺序即侧边栏顺序）。

`.md` 正文里的链接是**站点绝对路径、不带 `.md`**（如 `/themes/docs/overview/layout#margin-props`）。顺着读时补域名与 `.md`、保留 `#片段`，不要当相对路径解析。

**版本对不上时先升级，再以源码定案**：文档站永远指向最新版；本地 prop 与文档不一致，先升级 `@radix-ui/themes`（多半是依赖落后），升级后仍不一致才是文档与源码的真实分歧——那时以本地源码为准（`Theme.appearance` 默认值就是文档写 `light`、源码 `inherit` 的例子）。

## 我要做 X，读哪个文件

| 你要做的事 | 读 |
|---|---|
| 这个需求该用哪个组件 / 怎么组合 / 什么时候封 | [practices.md](references/practices.md) —— 选型、封装、效率、验收四章 |
| 拼一个页面 / 区块，选布局组件 | [layout-patterns.md](references/layout-patterns.md) —— 十种模式，正反对照 |
| 配主题、调颜色 / 圆角 / 缩放 | [theming.md](references/theming.md) —— 含像素表与继承规则 |
| 拼弹层 / 表单 / 表格 / 导航 | [components.md](references/components.md) —— 缺了会怎样、asChild、静默失败 |
| 样式不生效 / 贴边 / 截断 / 颜色不对 | [pitfalls.md](references/pitfalls.md) —— 症状索引 + 自查命令 |
| 判定某条规则的边界与理由 | [rules.md](references/rules.md) |
| 术语对不上（同一个东西有三种叫法） | [GLOSSARY.md](GLOSSARY.md) |

## 改之前 / 改之后

### 改之前

- [ ] 这个元素上，是否**同时**有 `.rt-r-*` 类与自定义 class 声明了同一属性？
- [ ] 非布局组件（如 `Slider`、`Text`、`Button`）需要限制尺寸或控制 flex 比例时，是否已用 `<Box>` / `<Flex>` 包裹？是否避免了在 CSS 里写 `min-width`/`max-width`/`flex`？
- [ ] 要放进 `p` / `gap` 的值是**单个档位**吗？响应式对象以 `initial` 为基准了吗（禁写 `base`）？
- [ ] 要写的 prop 在组件页上找不到时，查过 [§11 继承清单](references/components.md#11-继承-prop-面)了吗？
- [ ] `Tooltip` 包裹的元素是 `disabled` 吗？禁用按钮需外包一层带有 `tabIndex={0}` 的 span/Box。
- [ ] 换控件前量过尺寸档位吗？`Button` 只有 24 / 32 / 40，`Badge` 最小 12px

### 改之后

```bash
# ① 间距多值（有输出就是 bug）
grep -rnE '\b(p|px|py|pt|pr|pb|pl)="[^"]*[0-9] +[0-9]' src --include=*.tsx

# ② 字号三件套（排除第三方库覆盖层；其余有输出就是 bug）
grep -rnE '^\s*(font-size|letter-spacing)\s*:' src --include=*.css

# ③ 写死的颜色与圆角
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src --include=*.css --include=*.tsx

# ④ 裸元素（逐个判断是否语义必需）
grep -rnE '<(div|span|p|h[1-6])\b' src --include=*.tsx

# ⑤ 主题 prop 写在了后代（先 grep，再人工排除根文件与注释行）
grep -rnE '(<Theme|accentColor=|radius=|scaling=|appearance=)' src --include=*.tsx

# ⑥ 错误的响应式 base 键名（有输出就是 bug）
grep -rnE '\{\{[^}]*\bbase\s*:' src --include=*.tsx

# ⑦ CSS 中的布局属性泄漏（检查是否有类声明了本该由 Box/Flex 承担的布局属性）
grep -rnE '^\s*(min-width|max-width|flex|flex-grow|flex-shrink|flex-basis)\s*:' src --include=*.css
```

跑完再跑项目自带的类型检查、lint、格式化与构建。上面任何一条有输出，逐项处理：改，或在注释里写明偏离理由。

**愿意多付一点成本，就把检查变成构建失败**：把 [templates/.stylelintrc.mjs](templates/.stylelintrc.mjs) 复制到项目根，②③ 会直接报错；[templates/ci.yml](templates/ci.yml) 是 CI 片段；[templates/AGENTS.snippet.md](templates/AGENTS.snippet.md) 是一段写进 `AGENTS.md` 的常驻约束。

## 接入

```bash
npm install @radix-ui/themes
npm install @radix-ui/react-icons   # 只在用到图标时
```

```tsx
// main.tsx —— 样式表放在项目样式之前（顺序决定谁覆盖谁）
import '@radix-ui/themes/styles.css'
import './index.css'
```

```tsx
// app.tsx —— 根节点只有一个 Theme
import { Theme } from '@radix-ui/themes'

export default function App() {
  return (
    <Theme appearance="light" grayColor="slate">
      <YourApp />
    </Theme>
  )
}
```

- [ ] `@radix-ui/themes/styles.css` 已引入，且在项目样式之前
- [ ] 全应用**只有一个**根 `Theme`（嵌套 Theme 是另一回事，见 theming.md §6）
- [ ] 没有 `<ThemePanel />`（开发期调参浮层，上线前移除）
- [ ] 组件统一从包根导入：`import { Button } from '@radix-ui/themes'`

## 参考

组件 / 布局 / 主题 / 令牌 / Type scale 的官方入口都在 [llms.txt](references/llms.txt) 里：按组件名（英文）搜即可，分组名就是用途线索。

[llms.txt](references/llms.txt) 是**手工维护**的索引：查不到页面或链接失效时，以项目本地 `node_modules` 与官方文档为准，不要因为索引缺失就断定组件不存在。
