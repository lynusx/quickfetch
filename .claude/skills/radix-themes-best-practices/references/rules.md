# Radix Themes 使用规则

本文件是「怎么用 Radix 组件」的完整规则，含每条的机制与例外判据。
上层入口是 [SKILL.md](../SKILL.md)：那里是干活时照着做的清单，这里是判定与查证用的依据。
**该选谁、何时封、何时破例**这类决策不在本文件，在 [practices.md](practices.md)。

> 改任何 UI 前读一遍第 1、2、6 节；碰到「这条到底该写 props 还是 CSS」查第 2 节；
> 碰到「这个值能不能用」查第 3、7 节；碰到「为什么这里留着 CSS」查第 8 节。

---

## 1. 样式的五层来源与优先级

一个元素最终的样式由五层叠加，**越靠后优先级越高**。改外观之前先想清楚「该动哪一层」：

| 层 | 来源 | 特异性 | 能盖谁 / 被谁盖 |
| --- | --- | --- | --- |
| ① 主题令牌 | `<Theme>` 在根上下发 `--radius-*` / `--accent-*` / `--gray-*` / `--space-*` / `--focus-*` | — | 全局默认值；改一处全站联动（见 [theming.md](theming.md)） |
| ② 组件基础样式 | Radix 自带的组件外观与 reset，挂在 `.rt-*` 类上；整库把特异性封顶在 0-1-0，只有部分内部选择器用 `:where()` 归零 | **0-1-0** | 与 ③ ④ 同级，靠加载顺序决定胜负 |
| ③ prop 工具类 | `gap="2"` 等生成的 `.rt-r-*` | 0-1-0 | 盖 ②；与 ④ 平级 |
| ④ 自定义 class | 项目 CSS，在 Radix 样式之后加载 | 0-1-0 | 与 ③ 同特异性，**后加载者胜**——双写时 prop 静默失效的机制根源（见 §2.1） |
| ⑤ 内联 style | `style={{ … }}` 与 `--p: …` 内联变量 | 最高 | 少用；`ScrollArea` 的 `style={{ flexGrow: 1 }}` 是少数合法场景（见 §2.3） |

三条推论：

- 想让全站一致 → 改 ①（令牌），不要逐组件覆盖。
- 想改单个组件的外观 → 优先 ③（prop），prop 没有对应能力才落 ④。
- ③ 与 ④ 写了同一属性 = bug，不是「冗余」——这正是双写规则的根源。

组件「继承或派生」样式，说的就是 ① → ② → ③ 这条链：组件外观从令牌派生（改 `radius` 圆角全变）、
prop 在组件默认之上做局部调整。逐组件的派生细节见 [theming.md](theming.md)。

---

## 2. props 与 CSS 的分工

### 2.1 同一属性只写一处

props 生成的 `.rt-r-*` 与自定义 class 同级，**项目 CSS 在 Radix 之后加载，后加载者胜**。
所以「props 写一遍、CSS 再写一遍」不是冗余，而是**静默让 prop 失效**：改 prop 没有任何反应，
排查时会怀疑组件库。改被多处引用的共享组件时最容易犯——一处双写就是全局漂移。

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

### 2.2 必须留在 CSS 的

`border` / `background` / `box-shadow` / `transition`、伪类与 `[data-state]`、`:has()`、
后代/子/兄弟选择器、`.rt-*` 内部类覆盖、`Popover.Content` 的 `overflow`、`IconButton` 的 `flex-shrink`。

**状态强调的字重**（选中加粗、异常行加粗）也留在 CSS——它表达的是状态差异，不是排版基线。

### 2.3 不转发布局 props 的组件

| 组件         | 只能怎么调                                                       |
| ------------ | ---------------------------------------------------------------- |
| `ScrollArea` | 只接受 `type` / `scrollbars` / `radius` / `size` 与 margin props，其余 props **静默丢弃**；`flex` / `padding` 要给内层 `Box` 与 CSS |
| `IconButton` | 不接布局 props（`flex-shrink` 写 CSS）；尺寸/变体之外还接 `color` / `radius` / `highContrast` / `loading` / `asChild` |
| `Card` | 圆角与内边距由 `size` 决定（源码 `--base-card-*`），要改就覆盖这些变量 |

这类组件用注释说明原因，**不要为此换组件**。

---

## 3. 尺度

间距、字号、行高、圆角、字重、字距只取 Radix 档位，不写自定值——`gap="11px"` / `pt="12px"` /
`font-size: 11.5px` 会让垂直节奏各走各的，改一处变成改一百遍。

| 尺度           | 档位                                                 | props 写法                   | CSS 写法                 |
| -------------- | ---------------------------------------------------- | ---------------------------- | ------------------------ |
| Space          | 1–9 = 4/8/12/16/24/32/40/48/64                       | `gap="3"`、`p="4"`、`mb="2"` | `var(--space-3)`         |
| Font size      | 1–9 = 12/14/16/18/20/24/28/35/60                     | `<Text size="1">`            | **不写**，由 `size` 派生 |
| Line height    | `Text` 1–9 = 16/20/24/26/28/30/36/40/60；`Heading` 自有一套 16/18/22/24/26/30/36/40/60 | `size` 自带 | **不写**，由 `size` 派生 |
| Radius         | 1–6 = 3/4/6/8/12/16                                  | `radius="2"`                 | `var(--radius-4)`        |
| Weight         | 300 / 400 / 500 / 700                                | `weight="medium"`            | **不写**，用 `weight`    |
| Letter spacing | 1–9 = +0.0025em → −0.025em                           | `size` 自带                  | **不写**，由 `size` 派生 |

### 3.1 落在两档之间怎么取

**就近取整**。正好在中间（6 / 10 / 14 / 20 / 28）时：间距类（`gap` / `margin`）**向上取**、
内边距（`padding`）**向下取**——元素间更透气，容器内边距不虚胖。

### 3.2 尺度不管固定尺寸

`width` / `height` / `maxWidth` / 容器宽高（侧边栏宽、内容最大宽、图标框尺寸）
是按几何关系算的，space 档位里没有对应值，**保持原值**。
`border-radius: 50%` / `999px` 是圆形与胶囊语义，用 `radius="full"`，不算尺度。

### 3.3 间距 prop 不接多值简写

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
# 有输出就是漏了（按项目实际源码目录调整）
grep -rnE '\b(p|px|py|pt|pr|pb|pl)="[0-9]+ [0-9]' src --include=*.tsx
```

案例见 [pitfalls.md §2](pitfalls.md#2-元素贴边内边距像是-0)。

---

## 4. 字号只由 `size` 决定

Radix 的 type scale 里，一个 `size` 同时定义 font-size、line-height 与 letter-spacing 三件套
（[官方 type scale](https://www.radix-ui.com/themes/docs/theme/typography#type-scale)）。
机制是 `.rt-Text:where(.rt-r-size-N)` 下发 `--line-height` / `--letter-spacing` 局部变量，
再由 `.rt-Text { line-height: var(--line-height); letter-spacing: var(--letter-spacing) }` 消费。

所以**设了 `size` 就不要再写 `font-size` / `line-height` / `letter-spacing`**——
写了必定盖掉 prop，且因为项目 CSS 后加载，是静默生效，看代码看不出来。
没有 `size` 的组件先补 `size`，不要用 CSS 手搓一套字号。字重走 `weight`，不写 `font-weight`。

### 4.1 `Text` 和 `Heading` 的同一 `size` 不等价

`Heading` 行高走 `--heading-line-height-N`，size 2–5 比 `Text` 紧 2px
（18 vs 20、22 vs 24、24 vs 26、26 vs 28），size 1 / 6–9 相同。
这是 Radix 的设计意图，不是 bug；把标题从 CSS 手写改成 `size` 时行高会跟着变，先确认这是要的效果。

### 4.2 唯一留 CSS 的情况

第三方组件的类名拿不到 prop（例如 react-day-picker 的 `.rdp-*`）。这类要在注释里写明是哪一方的类名。

把 stylelint 挂进项目的 lint 命令后，CSS 里的 `font-size` / `letter-spacing` 会直接被拦下；
确实要例外就在上一行写 `stylelint-disable-next-line` 并说明理由。

---

## 5. 颜色

### 5.1 颜色下沉到 `Text`

`Text` 有 `color` prop，颜色就是它的事——和间距下沉到 `Flex` 同理。
容器上的 `color` / `font-*` / `text-align` 一律下沉到内部 `Text`；
容器只留「成型必需」的视觉属性（`border` / `background` / `border-radius` / `box-shadow` / `transition` / `cursor`）。

只为 CSS 状态色服务的挂点（`data-state` / `data-tone`）随之删除，
改用「语气 → 颜色」的映射表集中翻译，改一个语气只改一行。

### 5.2 两个已知边界（不是偷懒，量过才算）

1. **给不到 9 / 10 阶。** 具名色 = 11 阶，加 `highContrast` = 12 阶，中间没有档位。
   需要 gray-10 / gray-9 的文字（如弱化标签、数字单位）只能留 CSS。
   `Badge` 的色名同样只到 11 阶，要压到 9 阶属同类例外。
2. **没有「跟随主题强调色」的选项。** `color` 只接受具名色名，需要强调色时只能写死具体色名——
   改 `accentColor` 必须同步改所有写死该色名的地方。

另有一个观感事实：`Text color="indigo"` 渲染的是 `--indigo-a11`（alpha 版），
实测 `rgba(0, 43, 183, 0.773)`，不是实色 `--indigo-11`。这是 Radix 的设计（彩色文字带透明度以适配背景），
**不是 bug，不要覆盖**。

### 5.3 颜色可以压在容器上的三种情形

| 情形                       | 例子                                                          |
| -------------------------- | ------------------------------------------------------------- |
| 给 svg 图标上色            | 提示行内的小图标、导航图标                                    |
| 给图形上色（不是文字）     | 状态圆点                                                      |
| **随祖先状态变化**的文字色 | 导航项选中态里的 label、上传区 hover 时的提示文字              |

第三种是因为 `Text` 的 `color` 是静态 prop，响应不了祖先的 `:hover` / `[aria-current]`。

---

## 6. 布局组件的分工

### 6.1 文字必须在 Typography 里

`<Flex>一段话</Flex>`、`<Box>标签</Box>` 这种写法不许出现：文字不能是布局组件的直接子节点。
`color` / `weight` / `align` / `size` 都是排版语义，容器不该替它决定。

为什么：`Text` 的 prop 集合（`as` / `size` / `weight` / `align` / `trim` / `truncate` / `wrap` /
`color` / `highContrast` / `asChild`，外加 common margin props）里没有 `gap` / `padding`，容器的
prop 集合里没有 `color`——这条边界是组件库自己划的，顺着它走就不用发明规则。

### 6.2 一个容器不干多件事

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

### 6.3 原生标签只在语义必需时用

`button` / `label` / `input` / `details` / `summary` 保留，但要保证可访问名称；
图标按钮必须有 `aria-label`。典型场景：路由链接、文件上传区、折叠区块。

`Box` 的 `as` 只支持 `"div" | "span"`；要 `<section>` 语义就用 `Section` 组件或保留原生标签并说明理由。

---

## 7. 不写组件自带的默认值

| 组件     | 默认值                                          | 写了算噪音？         |
| -------- | ----------------------------------------------- | -------------------- |
| `Text`   | `as="span"`，**无默认 size**（不写=继承父级字号） | `as` 算；`size` 必须写 |
| `Heading`| `as="h1"`，`size="6"`                           | 都算                 |
| `Badge`  | `size="1"`，`variant="soft"`                    | 都算                 |
| `Button` | `size="2"`，`variant="solid"`，`loading={false}` | 都算                 |
| `Flex`   | `as="div"`，`direction="row"`（CSS 默认）        | 都算                 |

**`Text` 的 `size` 是唯一例外**：它没有默认值，不写即**继承父级字号**（父级 `size="2"` 就是 14px），不是取默认，所以必须显式写。`Heading` 有默认 `size="6"`，写 `size="6"` 同样是噪音。

判据与两类例外见 [practices.md §3.2](practices.md#32-只写偏离默认值的-prop)。

---

## 8. 例外与决策

### 8.1 例外的判定标准

每条合法例外都能指到一个**具体原因**（哪一方的类名、哪个 prop 不存在、哪个档位给不到），
且原因写在代码注释里。写不出这句话的，就是偷懒。合法形态穷尽如下：

| 形态                                                       | 为什么不能迁                                       |
| ---------------------------------------------------------- | -------------------------------------------------- |
| 第三方组件生成的 DOM（如 react-day-picker 的 `.rdp-*`）    | 类名拿不到 React prop                               |
| 需要 9 / 10 阶灰的文字                                     | `Text color` 具名色只到 11 阶（见 §5.2）            |
| `Badge` 要压到 9 阶的弱化色                                | 色名同样只到 11 阶                                  |
| 必须渲染成特定原生元素（如要 `aria-current` 的路由 `<a>`） | 换成布局组件会丢语义与行为                          |
| 根节点是原生 `<label>` 的容器                              | `text-align` 作用于 inline 子节点，只能留在它上面   |
| 随祖先状态（`:hover` / `[aria-current]`）变化的文字色      | `Text` 的 `color` 是静态 prop，响应不了（见 §5.3）  |
| 给 svg 与图形上色                                          | 不是文字（见 §5.3）                                 |
| 等宽字体                                                   | `Text` 没有 `font-family` prop，靠容器继承          |
| 状态强调的字重                                             | 表达状态差异，不是排版基线（见 §2.2）               |
| `Popover.Content` 的 `overflow`                            | Popover 没有 overflow prop                          |

### 8.2 卡片外观只有一处实现

需要统一的白卡外观就用 `Card variant="surface"` + 一个自定义类，全项目只有这一处实现。
自定义类只做三件事：内边距归零（各面板自己用 `p` / `px` / `py` 排）、描边与底色换成项目令牌。

**圆角不在自定义类里写**：Card 默认 `size="2"` 自己算出 `--radius-4`，跟着 `Theme` 的
`radius` 一起缩放。真要更大的圆角就传 `size`，别覆盖 `--base-card-border-radius`——
`size` 管的是内边距档位，不该顺带成为圆角的第二个开关。

Card 的描边是 inset ring，**不占布局**：比手写 `border` 少 2px 高度、内容内缩少 1px。
从手写卡片迁移时这个高度差是预期的，不要往回补。

### 8.3 别只凭「长得像」换控件

换之前先量尺寸档位。Radix 的 `Button` 高度只有 **24 / 32 / 40**，`Badge` 最小字号 **12px**。
比这更小的控件硬换要写一堆覆盖，往往比保留现状更绕——先算账，算完不划算就保留现状并写清理由。

案例：看着像 Button 的元素若实则是 `<label>` 里的视觉提示，换成 Button 要覆盖高度 / 内距 /
圆角 / hover 共 5~6 处，还会引入嵌套可交互元素——不划算。

---

## 9. 不要重写主题已经分发的值

`Theme` 在根上下发整套令牌（`--radius-*`、`--gray-*`、`--accent-*`、`--space-*`、`--focus-*`），
组件从这些令牌派生自己的外观。因此「值恰好等于上游已经算出来的值」的声明全是噪音：
它不改善观感，只让下次改主题时多一处漏改。

判据只有一条：**删掉这条声明，`getComputedStyle` 是否一模一样**。一样就是冗余，
不一样就说明它确实在起作用，得留着并写清为什么。

四条规定由主题章节承载，这里不重复：

- 根节点只写非默认 prop → [theming.md §2](theming.md#2-根节点只写偏离默认值的-prop)
- 四类典型冗余形态与反向边界（`gray-10` 不是冗余） → [theming.md §9](theming.md#9-不要重写主题已经分发的值)
- 圆角按「容器 → 区块 → 控件」三级引用令牌 → [theming.md §3](theming.md#3-radius六档到底是多少像素)
- focus 环交给主题，只为原生可聚焦元素补一条 → [theming.md §9 focus 环](theming.md#focus-环)

### 9.1 自查

```bash
# 根节点有没有写回默认值（有输出就是写了；按项目实际入口文件调整）
grep -nE 'accentColor=|radius="medium"|scaling="100%"|panelBackground=' src/app.tsx

# CSS 里有没有「归零 / 默认文字色」这类冗余声明（Text、Heading 上出现即为多余）
grep -rnE '^\s*(margin: 0;|color: var\(--gray-12\);)' src --include=*.css

# 圆角有没有写死像素
grep -rn 'border-radius' src --include=*.css | grep -v 'var(--radius'
```

---

## 10. `Text` 的盒子边界

### 10.1 先纠正一个常见误判：`Text` **有** margin

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

### 10.2 四类判据：只有一类需要包盒

| 你要的效果 | 做法 | 包不包 | 依据 |
| --- | --- | --- | --- |
| 与兄弟元素的间距 | 父容器 `gap`（优先），或 `m*` prop | **不包** | 容器统一管节奏，改一处改全部 |
| 无背景/描边的「缩进」 | `m*` prop | **不包** | 无可见边界时 padding 与 margin 渲染位置完全一致（下方有实测） |
| 有背景/描边/圆角的**内边距** | `Box` / `Flex` 包，padding 加在容器 | **包** | 这个东西本来就是盒子，不是「文字」 |
| 作为 flex 子项的收缩与截断 | 留 CSS（`flex` / `min-width: 0`） | **不包** | 包了截断反而失效，约束必须落在真正受限的那个元素上 |

第二行的依据：一个 `<Text as="div">` 的 `padding: 0 8px 8px` 换成 `margin: 0 8px 8px` 后——

| 指标 | padding | margin |
| --- | --- | --- |
| 文字左偏移 | 8px | 8px |
| 下一个兄弟 top | 24px | 24px |
| 文字底部到兄弟 | 9px | 9px |
| 自身盒高 | 24px | 16px（无视觉影响） |

**padding 与 margin 的差别，只在盒子有可见边界时才显现出来。**

### 10.3 为什么「仅为加 padding 包一层」是坏模式

五条成本换一个 4px：

1. 多一层 DOM
2. 改变 flex 上下文——原本 `Text` 是 flex item，包完变成 `Box` 是 item、`Text` 在盒里
3. 如果 `Text` 有 `truncate`，截断参考的宽度约束变了
4. hover / 点击热区归属变乱（padding 落在非目标元素上）
5. **最要命的：它掩盖了归属错误**——你给文字加内边距，绝大多数时候该调的是祖容器的 padding，而不是给这段文字造一个盒子

### 10.4 两个「看起来像缺 prop」其实有 prop

| 想要 | 不要这样做 | 这样做 |
| --- | --- | --- |
| 块级排列 | CSS `display: block` | `as="div"`（`as` 支持 `span` / `div` / `label` / `p`，后两者自带 block） |
| 单行截断 + 省略号 | CSS `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap` | `truncate` |

实测：`<span>` + CSS `display: block` 与 `<p>` 的计算样式逐项相同（`display` / `font-size` / `line-height` / 盒子尺寸），兄弟元素位置也不变。

### 10.5 自查

```bash
# Text 上挂了 padding / border / background 的 class（有输出就要看是不是该换成盒子）
grep -rnE '^\s*(padding|border|background)' src --include=*.css

# Text 上写了 display: block（改用 as="div"）
grep -rn 'display: block' src --include=*.css

# Text 上写了截断三件套（改用 truncate）
grep -rn 'text-overflow: ellipsis' src --include=*.css
```

> 三条的输出都要人工判断：挂在 `Table.Cell` 等非 `Text` 元素上的属于合理用法。
