# Radix Themes 使用规则

本文件是「怎么用 Radix 组件」的完整规则，含每条的机制与项目里确认过的例外。
上层入口是 [SKILL.md](../SKILL.md)：那里是干活时照着做的清单，这里是判定与查证用的依据。

> 改任何 UI 前读一遍第 1、5 节；碰到「这条到底该写 props 还是 CSS」查第 1 节；
> 碰到「这个值能不能用」查第 2、6 节；碰到「为什么这里留着 CSS」查第 7 节。

---

## 1. props 与 CSS 的分工

### 1.1 同一属性只写一处

props 生成的 `.rt-r-*` 与自定义 class 同级，**项目 CSS 在 Radix 之后加载，后加载者胜**。
所以「props 写一遍、CSS 再写一遍」不是冗余，而是**静默让 prop 失效**：改 prop 没有任何反应，
排查时会怀疑组件库。改共享组件（`Field` / `Panel` / `EmptyState` / `Stat` / `ChoiceList`）
时最容易犯——它们被全站引用，一处双写就是全局漂移。

```tsx
// ❌ tsx 写了 gap="2"（8px），CSS 又写 gap: 6px，实际生效 6px，prop 是死的
<Grid className="choice-grid" gap="2">
.choice-grid { display: grid; gap: 6px; }

// ✅ 布局只在 props 里写一次，值取尺度档位，CSS 只留列模板
<Grid className="choice-grid" gap="2">
.choice-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
```

```css
/* ❌ display / flex-direction / gap 与 tsx props 逐条重复 */
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* ✅ 这些全部删掉，由 <Flex direction="column" gap="2"> 表达 */
```

### 1.2 必须留在 CSS 的

`border` / `background` / `box-shadow` / `transition`、伪类与 `[data-state]`、`:has()`、
后代/子/兄弟选择器、`.rt-*` 内部类覆盖、`Popover.Content` 的 `overflow`、`IconButton` 的 `flex-shrink`。

**状态强调的字重**（选中加粗、异常行加粗）也留在 CSS——它表达的是状态差异，不是排版基线。

### 1.3 不转发布局 props 的组件

| 组件         | 只能怎么调                                                       |
| ------------ | ---------------------------------------------------------------- |
| `ScrollArea` | 只接受 `type` / `scrollbars` / `radius`；`flex` / `padding` 要给内层 `Box` 与 CSS |
| `IconButton` | 只转发尺寸与变体，`flex-shrink` 写 CSS                            |
| `Card`       | 圆角与内边距只跟 `size` 走，要改就覆盖 `--base-card-*` 变量       |

这类组件用注释说明原因，**不要为此换组件**。

---

## 2. 尺度

间距、字号、行高、圆角、字重、字距只取 Radix 档位，不写自定值——`gap="11px"` / `pt="12px"` /
`font-size: 11.5px` 会让垂直节奏各走各的，改一处变成改一百遍。

| 尺度           | 档位                                                 | props 写法                   | CSS 写法                 |
| -------------- | ---------------------------------------------------- | ---------------------------- | ------------------------ |
| Space          | 1–9 = 4/8/12/16/24/32/40/48/64                       | `gap="3"`、`p="4"`、`mb="2"` | `var(--space-3)`         |
| Font size      | 1–9 = 12/14/16/18/20/24/28/35/60                     | `<Text size="1">`            | **不写**，由 `size` 派生 |
| Line height    | `Text` 16/20/24/26/28/30，`Heading` 同 size 更紧 2px | `size` 自带                  | **不写**，由 `size` 派生 |
| Radius         | 1–6 = 3/4/6/8/12/16                                  | `radius="2"`                 | `var(--radius-4)`        |
| Weight         | 300 / 400 / 500 / 700                                | `weight="medium"`            | **不写**，用 `weight`    |
| Letter spacing | 1–9 = +0.0025em → −0.025em                           | `size` 自带                  | **不写**，由 `size` 派生 |

### 2.1 落在两档之间怎么取

**就近取整**。正好在中间（6 / 10 / 14 / 20 / 28）时：间距类（`gap` / `margin`）**向上取**、
内边距（`padding`）**向下取**——元素间更透气，容器内边距不虚胖。

### 2.2 尺度不管固定尺寸

`width` / `height` / `maxWidth` / 容器宽高（侧边栏 242px、内容 1480px、图标框 22/28/42px）
是按几何关系算的，space 档位里没有对应值，**保持原值**。
`border-radius: 50%` / `999px` 是圆形与胶囊语义，用 `radius="full"`，不算尺度。

### 2.3 间距 prop 不接多值简写

`p="2 4"` / `p="6 4"` / `p="2 2 1"` 全是坏的。Radix 的 spacing prop 类型是 `enum | string`，
字符串被原样写进 CSS 变量：

```html
<div class="rt-r-p" style="--p: 2 4">
```

```css
.rt-r-p { padding: var(--p); }   /* padding: 2 4 → 缺单位 → 整条声明被丢弃 */
```

结果是 `padding: 0`——**不报错，静默变成 0**。TypeScript 不拦（类型允许任意 string），
stylelint 不管（不在 CSS 里），code review 看不出（`2 4` 在 CSS 里合法）。

多值一律拆成方向 prop：`py="2" px="4"`、`pt="2" pb="1" px="2"`。
`p` / `px` / `py` 只写**单个档位**（`"4"`）或**带单位的完整值**（`"16px"`、`"8px 16px"`）。

```bash
# 有输出就是漏了
grep -rnE '\b(p|px|py|pt|pr|pb|pl)="[0-9]+ [0-9]' src/renderer --include=*.tsx
```

项目里曾有 8 处（`settings-row`、`empty-state`、`copy-panel`、`copy-progress`、`history-panel` ×2、
`scan-task-panel`、`app-sidebar`），padding 一直是 0。案例见 [anti-patterns.md 第 11 节](anti-patterns.md)。

---

## 3. 字号只由 `size` 决定

Radix 的 type scale 里，一个 `size` 同时定义 font-size、line-height 与 letter-spacing 三件套
（[官方 type scale](https://www.radix-ui.com/themes/docs/theme/typography#type-scale)）。
机制是 `.rt-Text:where(.rt-r-size-N)` 下发 `--line-height` / `--letter-spacing` 局部变量，
再由 `.rt-Text { line-height: var(--line-height); letter-spacing: var(--letter-spacing) }` 消费。

所以**设了 `size` 就不要再写 `font-size` / `line-height` / `letter-spacing`**——
写了必定盖掉 prop，且因为项目 CSS 后加载，是静默生效，看代码看不出来。
没有 `size` 的组件先补 `size`，不要用 CSS 手搓一套字号。字重走 `weight`，不写 `font-weight`。

### 3.1 `Text` 和 `Heading` 的同一 `size` 不等价

`Heading` 行高走 `--heading-line-height-N`，size 2–5 比 `Text` 紧 2px
（18 vs 20、22 vs 24、24 vs 26、26 vs 28），size 1 / 6–9 相同。
这是 Radix 的设计意图，不是 bug；把标题从 CSS 手写改成 `size` 时行高会跟着变，先确认这是要的效果。

### 3.2 唯一留 CSS 的情况

第三方组件的类名拿不到 prop（现有：react-day-picker 的 `.rdp-caption_label` / `.rdp-weekday` /
`.rdp-day_button`）。这类要在注释里写明是哪一方的类名。

`pnpm lint` 里的 stylelint 会直接拦下 CSS 里的 `font-size` / `letter-spacing`；
确实要例外就在上一行写 `stylelint-disable-next-line` 并说明理由。

### 3.3 历史包袱

曾经有 19 处 `Text size="1"` 配 CSS 的 `font-size-1` + `line-height-1`，prop 全程是死的；
另有 11 处压根没写 `size`，用 CSS 手搓整套字号。两类都是同一个错：
以为「CSS 覆盖了 prop，那 prop 就没用了 / 得留着」。正确做法永远是让 `size` 单点生效。

---

## 4. 颜色

### 4.1 颜色下沉到 `Text`

`Text` 有 `color` prop，颜色就是它的事——和间距下沉到 `Flex` 同理。
容器上的 `color` / `font-*` / `text-align` 一律下沉到内部 `Text`；
容器只留「成型必需」的视觉属性（`border` / `background` / `border-radius` / `box-shadow` / `transition` / `cursor`）。

只为 CSS 状态色服务的挂点（`data-state` / `data-tone`）随之删除，
改用「语气 → 颜色」的映射表集中翻译，改一个语气只改一行。

### 4.2 两个已知边界（不是偷懒，量过才算）

1. **给不到 9 / 10 阶。** 具名色 = 11 阶，加 `highContrast` = 12 阶，中间没有档位。
   `.stat-label` 要 `gray-10`、`.stat-unit` 要 `gray-9`，只能留 CSS。
   `Badge` 的色名同样只到 11 阶，`.share-badge[data-tone='muted']` 压到 9 阶属同类例外。
2. **没有「跟随主题强调色」的选项。** `color` 只接受具名色名，需要强调色时写具体色名
   （现在是 `indigo`）。改 `accentColor` 必须同步改所有写死 `indigo` 的地方。

另有一个观感事实：`Text color="indigo"` 渲染的是 `--indigo-a11`（alpha 版），
实测 `rgba(0, 43, 183, 0.773)`，不是实色 `--indigo-11`。这是 Radix 的设计（彩色文字带透明度以适配背景），
**不是 bug，不要覆盖**。

### 4.3 颜色可以压在容器上的三种情形

| 情形                       | 例子                                                    |
| -------------------------- | ------------------------------------------------------- |
| 给 svg 图标上色            | `.inline-hint svg`、`.nav-icon`                         |
| 给图形上色（不是文字）     | `.status-dot`                                           |
| **随祖先状态变化**的文字色 | `.nav-item[aria-current] .nav-label`、`.upload-zone:hover .upload-cta-label` |

第三种是因为 `Text` 的 `color` 是静态 prop，响应不了祖先的 `:hover` / `[aria-current]`。

---

## 5. 布局组件的分工

### 5.1 文字必须在 Typography 里

`<Flex>一段话</Flex>`、`<Box>标签</Box>` 这种写法不许出现：文字不能是布局组件的直接子节点。
`color` / `weight` / `align` / `size` 都是排版语义，容器不该替它决定。

为什么：`Text` 的 prop 集合（`as` / `size` / `weight` / `align` / `trim` / `truncate` / `wrap` /
`color` / `highContrast` / `asChild`）里没有 `gap` / `padding` / `margin`，容器的 prop 集合里没有 `color`——
这条边界是组件库自己划的，顺着它走就不用发明规则。

### 5.2 一个容器不干多件事

需要对齐 + 间距 + 外观时，用「多个布局组件配合」而不是一条 class 写十行：
`Flex` 管方向与间距，`Box` 管背景与描边，`Text` 管文字。

判据是**有没有裸布局声明**（`display` / `flex-*` / `align-items` / `justify-content` / `gap` /
`padding` 的裸值），**不是声明条数**——一条 `display: flex` 和十条一样违规。

```tsx
// ❌ 一条 class 同时管排版、布局、外观
.upload-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border: 1px solid var(--gray-a6);
  color: var(--gray-12);
}

// ✅ Flex 管方向 / 对齐 / 间距，class 只管这个盒子的外观
<Flex className="upload-cta" display="inline-flex" align="center" gap="2">
.upload-cta {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--gray-a6);
}
```

**迁移前必做的一步**：先量原生效值。CSS 的 `gap: 8px` 对应 `gap="2"`，不是 `gap="1"`。

### 5.3 原生标签只在语义必需时用

`button` / `label` / `input` / `details` / `summary` 保留，但要保证可访问名称；
图标按钮必须有 `aria-label`。现有：历史摘要行、Excel 上传区、快捷方式折叠区。

`Box` 的 `as` 只支持 `"div" | "span"`；要 `<section>` 语义就用 `Section` 组件或保留原生标签并说明理由。

---

## 6. 不写组件自带的默认值

| 组件     | 默认值                                          | 写了算噪音？         |
| -------- | ----------------------------------------------- | -------------------- |
| `Text`   | `as="span"`，**无默认 size**（继承 16px）       | `as` 算，`size` 不算 |
| `Heading`| `as="h1"`，`size="6"`                           | `as` 算，`size` 不算 |
| `Badge`  | `size="1"`                                      | 算                   |
| `Button` | `size="2"`，`variant="solid"`                   | 都算                 |
| `Flex`   | `as="div"`，`display="flex"`，`direction="row"` | 都算                 |

**`Text` / `Heading` 的 `size` 是例外**：它是字号三件套的唯一来源，即使等于默认档也必须显式写，
否则下一个人不知道这里是有意取默认还是漏了。`Text` 没有默认 `size`，不写即继承 16px。

---

## 7. 例外与决策

### 7.1 项目里确认过的技术例外

都能指到一个**具体原因**（哪一方的类名、哪个 prop 不存在、哪个档位给不到），且原因写在代码注释里。
写不出这句话的，就是偷懒。

| 位置                                                    | 为什么不能迁                                        |
| ------------------------------------------------------- | --------------------------------------------------- |
| `.rdp-*`（3 处字号）                                    | react-day-picker 生成的 DOM，类名拿不到 React prop  |
| `.stat-label` / `.stat-unit`                            | `Text color` 给不到 9 / 10 阶                       |
| `.share-badge[data-tone='muted']`                       | `Badge` 色名同样只到 11 阶                          |
| `.nav-item`（`display` / `gap` / `padding`）            | 必须是 `<NavLink>` 渲染的 `<a>`（提供 `aria-current` 与客户端跳转） |
| `.upload-zone`（`display` / `gap` / `text-align`）      | 根节点是原生 `<label>`；`text-align` 作用于 inline 子节点 |
| `.nav-item[aria-current] .nav-label` 等                 | `Text` 的 `color` 是静态 prop，响应不了祖先状态      |
| `.nav-icon` / `.inline-hint svg` / `.status-dot`        | 给 svg 与图形上色，不是文字                          |
| `.path-strip` / `.target-dir`（`font-family`）          | `Text` 没有 `font-family` prop，等宽靠容器继承      |
| `.choice-cell[data-selected] .choice-label`             | 状态强调的字重，表达状态差异不是排版基线            |
| `Popover.Content`（`overflow`）                         | Popover 没有 overflow prop                          |

### 7.2 卡片外观只有一处实现

需要白卡就用 `Card variant="surface"` + `index.css` 的 `.app-card`。`.app-card` 只做三件事：
内边距归零（各面板自己用 `p` / `px` / `py` 排）、描边换成 `--app-border`、底色换成 `--app-surface`。

**圆角不在 `.app-card` 里写**：Card 默认 `size="2"` 自己算出 `--radius-4`，跟着 `Theme` 的
`radius` 一起缩放。真要更大的圆角就传 `size`，别覆盖 `--base-card-border-radius`——
`size` 管的是内边距档位，不该顺带成为圆角的第二个开关。

用了 Card 就别指望高度和手写 `border` 完全一致——它的描边是 inset ring，**不占布局**，
比手写 `border` 少 2px 高度、内容内缩少 1px。

### 7.3 别只凭「长得像」换控件

换之前先量尺寸档位。Radix 的 `Button` 高度只有 **24 / 32 / 40**，`Badge` 最小字号 **12px**。
比这更小的控件硬换要写一堆覆盖，往往比保留现状更绕——先算账，算完不划算就保留现状并写清理由。

案例：Excel 上传区的 `.upload-cta` 看着像 Button，实则是 `<label>` 里的视觉提示，不是独立控件。
换成 Button 要覆盖高度 / 内距 / 圆角 / hover 共 5~6 处，还会引入嵌套可交互元素。

---

## 8. 不要重写主题已经分发的值

`Theme` 在根上下发整套令牌（`--radius-*`、`--gray-*`、`--accent-*`、`--space-*`、`--focus-*`），
组件从这些令牌派生自己的外观。因此「值恰好等于上游已经算出来的值」的声明全是噪音：
它不改善观感，只让下次改主题时多一处漏改。

判据只有一条：**删掉这条声明，`getComputedStyle` 是否一模一样**。一样就是冗余，
不一样就说明它确实在起作用，得留着并写清为什么。

### 8.1 已经清过的四类

| 形态                       | 例子                                                            | 为什么冗余                                                        |
| -------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| 组件默认 prop              | `<Theme accentColor="indigo" radius="medium" scaling="100%">`   | 与 Radix 默认值逐字相同；`grayColor="auto"` 对 indigo 解析就是 slate |
| 已被 reset 归零的盒模型    | `.empty-title { margin: 0 }`                                    | `.rt-Text` / `.rt-Heading` 本来就是 `margin: 0`                   |
| 已由根节点继承的文字色     | `.panel-title { color: var(--gray-12) }`                        | `.radix-themes` 本来就是 `gray-12`                                |
| 已由组件算出的圆角         | `.app-card { --base-card-border-radius: var(--radius-4) }`       | Card 默认 `size="2"` 算出来正是 `--radius-4`                      |

注意反向边界：`color: var(--gray-10)`（说明文字）**不是**冗余——`Text color="gray"` 只到 11 阶，
10 阶表达不了，只能留 CSS。判据永远是实测值，不是「看起来像默认值」。

### 8.2 根节点只写「非默认」的 prop

| prop         | 默认值                   | 本项目 | 为什么写                                   |
| ------------ | ------------------------ | ------ | ------------------------------------------ |
| `appearance` | `inherit`（跟随系统）    | `light`| 产品只做浅色，不能跟随系统深浅色            |
| `grayColor`  | `auto`（随 accentColor） | `slate`| 钉死中性色，以后换 accentColor 不会连带换灰阶 |

`accentColor` / `radius` / `scaling` / `panelBackground` 一律不写。**后代组件更不该写**这四个
——它们全部从根继承，重复一次就是给主题开第二个开关。

### 8.3 圆角只选层级，不写像素

三级：**容器 `radius-4`**（卡片、侧边栏、内容区、导航项）→ **区块 `radius-3`**（`.stat`、列表、
进度块、图标底）→ **控件 `radius-2`**（`.choice-cell`、`.machine-item`、`.path-strip`）。
圆形（`.status-dot` 6px 圆点、`.step-index` 步骤号）用 `50%`，胶囊（导航指示条）用 `999px`。

全部走 `var(--radius-N)`，`Theme` 改 `radius` 时整体一起变。写 `border-radius: 8px` 就断了这条链。

### 8.4 focus 环交给主题

Radix 组件自己用 `--focus-8`（根上等于 `--accent-8`）画环，位置各不相同：
Button 在元素上、TextField 在 `:focus-within` 的 wrapper 上、Radio 在 `::before` 上。
所以**不要**写 `.app-shell :focus-visible`——那会盖掉组件自己的规则，还会在输入框上叠出第二层环。

只有原生可聚焦元素（NavLink 的 `<a>`、上传区 `<label>`、折叠区 `<summary>`）拿不到 Radix 样式，
用一条收窄的规则补，并用 `--focus-8` 而不是 `--accent-8`：

```css
.app-shell :is(a, label, summary):focus-visible {
  outline: 2px solid var(--focus-8);
  outline-offset: 2px;
}
```

### 8.5 自查

```bash
# 根节点有没有写回默认值（有输出就是写了）
grep -nE 'accentColor=|radius="medium"|scaling="100%"|panelBackground=' src/renderer/app.tsx

# CSS 里有没有「归零 / 默认文字色」这类冗余声明（Text、Heading 上出现即为多余）
grep -rnE '^\s*(margin: 0;|color: var\(--gray-12\);)' src/renderer --include=*.css

# 圆角有没有写死像素
grep -rn 'border-radius' src/renderer --include=*.css | grep -v 'var(--radius'
```

---

## 9. `Text` 的盒子边界

### 9.1 先纠正一个常见误判：`Text` **有** margin

`Text` 没有 padding、width、display，但**有完整的一组 margin prop**：`m` / `mx` / `my` / `mt` / `mr` / `mb` / `ml`，支持档位、任意 CSS 值与响应式对象。

三处证据，缺一个都会让人误判：

| 来源 | 说明 |
| --- | --- |
| 官方文档 | `Text` 页首句：this component is based on the `span` element and **supports common margin props**；示例里就有 `<Text as="p" mb="5" size="4">` |
| TS 类型 | `interface CommonTextProps extends MarginProps, TextOwnProps` |
| 实现 | `extractProps(props, textPropDefs, marginPropDefs)`——margin 是第二个 prop 组，所以 `textPropDefs` 里看不到它，但运行时生效 |

**官方文档的 prop 表不列 margin**，因为它是全组件共享的通用 prop，统一写在 overview/layout 下。别把「表里没有」当成「不支持」。

> 所以「给文字加间距」不需要包任何东西，`mb="2"` 就够。

`Text` 真正缺的是 **padding**（`text.js` 没有 `paddingPropDefs`），以及 `width` / `display` 这一类盒子属性。

### 9.2 四类判据：只有一类需要包盒

| 你要的效果 | 做法 | 包不包 | 依据 |
| --- | --- | --- | --- |
| 与兄弟元素的间距 | 父容器 `gap`（优先），或 `m*` prop | **不包** | 容器统一管节奏，改一处改全部 |
| 无背景/描边的「缩进」 | `m*` prop | **不包** | 无可见边界时 padding 与 margin 渲染位置完全一致（下节有实测） |
| 有背景/描边/圆角的**内边距** | `Box` / `Flex` 包，padding 加在容器 | **包** | 这个东西本来就是盒子，不是「文字」 |
| 作为 flex 子项的收缩与截断 | 留 CSS（`flex` / `min-width: 0`） | **不包** | 包了截断反而失效，约束必须落在真正受限的那个元素上 |

第二行的依据：`.nav-group-label`（`<Text as="div">`，`padding: 0 8px 8px`）换成 `margin: 0 8px 8px` 后——

| 指标 | padding | margin |
| --- | --- | --- |
| 文字左偏移 | 8px | 8px |
| 下一个兄弟 top | 24px | 24px |
| 文字底部到兄弟 | 9px | 9px |
| 自身盒高 | 24px | 16px（无视觉影响） |

**padding 与 margin 的差别，只在盒子有可见边界时才显现出来。**

### 9.3 为什么「仅为加 padding 包一层」是坏模式

五条成本换一个 4px：

1. 多一层 DOM
2. 改变 flex 上下文——原本 `Text` 是 flex item，包完变成 `Box` 是 item、`Text` 在盒里
3. 如果 `Text` 有 `truncate`，截断参考的宽度约束变了
4. hover / 点击热区归属变乱（padding 落在非目标元素上）
5. **最要命的：它掩盖了归属错误**——你给文字加内边距，绝大多数时候该调的是祖容器的 padding，而不是给这段文字造一个盒子

### 9.4 两个「看起来像缺 prop」其实有 prop

| 想要 | 不要这样做 | 这样做 |
| --- | --- | --- |
| 块级排列 | CSS `display: block` | `as="div"`（`as` 支持 `span` / `div` / `label` / `p`，后两者自带 block） |
| 单行截断 + 省略号 | CSS `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap` | `truncate` |

实测：`<span>` + CSS `display: block` 与 `<p>` 的计算样式逐项相同（`display` / `font-size` / `line-height` / 盒子尺寸），兄弟元素位置也不变。

### 9.5 已经收掉的四处

| 位置 | 原来 | 现在 | 判据 |
| --- | --- | --- | --- |
| `.nav-group-label` | CSS `padding: 0 8px 8px` | `mx="2" mb="2"` | 无边界 → margin 等价 |
| `.sheet-footer` | `Text` 上 `padding: 8px 0` + `border-top` | `<Box py="2">` 包 `Text`，CSS 只留 `border-top` | 有分隔线 → 确实是盒子 |
| `.stat` 两格 | CSS `margin-top` / `margin-left` | 父 `Flex gap="1"` + `ml="1"` | 块级走容器，行内走 prop |
| `.file-meta-item` | `<Box>` + CSS `padding` / `margin-top` | `<Flex direction="column" gap="1" py="2" px="3">` | 有边界的卡片 → 容器管间距与内距 |

顺带收掉的：`.file-meta` 的 `display: grid` + 列模板 + `gap` 三条与 `<Grid columns="3" gap="2">` 逐字重复，整条删除。

### 9.6 自查

```bash
# Text 上挂了 padding / border / background 的 class（有输出就要看是不是该换成盒子）
grep -rnE '^\s*(padding|border|background)' src/renderer --include=*.css

# Text 上写了 display: block（改用 as="div"）
grep -rn 'display: block' src/renderer --include=*.css

# Text 上写了截断三件套（改用 truncate）
grep -rn 'text-overflow: ellipsis' src/renderer --include=*.css
```

> 后两条的输出要人工判断：`.sheet-cell-nowrap` 之类挂在 `Table.Cell` 上，不在 `Text` 上，属于合理用法。
