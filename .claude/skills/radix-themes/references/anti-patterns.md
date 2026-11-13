# Radix Themes 反模式案例库

本文件是「现象 → 成因 → 改法」的实操对照。规则本身在 [rules.md](rules.md)，
自查清单在 [SKILL.md](../SKILL.md)；此处只放已经在本仓库真实发生过、并且已修掉的例子。
新发现一类问题就补一条，越具体越好（文件路径 + 前/后代码）。

---

## 1. 双写：props 与 CSS 各写一遍同一属性

**现象**：tsx 写了 `gap="2"`、`align="center"`，同组件的 CSS 又写了 `gap: 8px; align-items: center`。

**成因**：从静态 CSS 迁到 Radix props 时只加不减；后来的人以为是「CSS 为主线」，继续往 CSS 加。

**为什么危险**：项目 CSS 在 Radix 之后加载，`.rt-r-gap-2` 与 `.field` 同级、后者胜——prop 变成死的，
改 prop 没有任何效果，排查时会怀疑组件库。

```tsx
// ❌ 前（choice-list.tsx）
<Grid className="choice-grid" gap="2">
// css
.choice-grid { display: grid; gap: 6px; }   /* 6px 胜出，gap="2" 完全无效 */

// ✅ 后
<Grid className="choice-grid" gap="2">
// css
.choice-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
```

```tsx
// ❌ 前（field.css）
.field { display: flex; flex-direction: column; gap: 8px; }
.field-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

// ✅ 后：两条规则整体删除，由 <Flex direction="column" gap="2"> 与
// <Flex align="center" justify="between" gap="3" minHeight="22px"> 表达
```

**判断口径**：`display` / `flex-direction` / `align-items` / `justify-content` / `gap` / `padding` /
`margin` / `width` / `height` / `min-width` / `flex` / `overflow` 只要组件有对应 prop，
就只写在 props 里；值不是 Radix 尺度（`"1"`~`"9"`）时写原值（`gap="7px"`、`p="34px 20px"`）。

**已修**：`field`、`empty-state`、`stat`、`choice-list`、`panel`、`scan-task-panel`、
`copy-progress`、`copy-panel`、`history-panel`、`plant-scan-page`、`plant-machine-picker`、
`app-sidebar`、`settings-group`。

### 1.1 排版三件套：font-size / line-height / letter-spacing

**现象**：`<Text size="1">` 旁边，CSS 里还写着 `font-size: var(--font-size-1); line-height: var(--line-height-1)`。
19 处是这样同值冗余，另有 3 处两边的档位根本不一致，还有 11 处完全没写 `size`、只用 CSS 手搓。

**成因**：误以为 `size` 只给字号。实际上 Radix 的 type scale 里一个 `size` 同时决定三件事——
`.rt-Text:where(.rt-r-size-1) { font-size: …; --line-height: var(--line-height-1); --letter-spacing: var(--letter-spacing-1); }`，
再由 `.rt-Text { line-height: var(--line-height); letter-spacing: var(--letter-spacing) }` 消费。

**为什么危险**：这是第 1 节双写的一个特例，但更隐蔽——两边值相同时完全看不出问题，改 prop 也没反应；
值不同时（`.page-shell-description` 是 `size="1"` 配 `font-size-2`），实际字号和代码写的差两档，
只有量 `getComputedStyle` 才发现。

```tsx
// ❌ 前（panel.tsx + panel.css）：size 只剩 letter-spacing 还活着
<Heading as="h2" className="panel-title">
.panel-title { font-size: var(--font-size-2); line-height: var(--line-height-2);
               letter-spacing: var(--letter-spacing-8); font-weight: 700; }

// ✅ 后：三件套全交给 size，CSS 只剩 API 表达不了的 margin 与颜色
<Heading as="h2" size="2" className="panel-title">
.panel-title { margin: 0; color: var(--gray-12); }
```

```tsx
// ❌ 前（choice-list.css）：size="2"（14/20）被 font-size-1 / line-height-1 改成 12/16
<Text as="span" size="2" className="choice-label">
.choice-label { font-size: var(--font-size-1); line-height: var(--line-height-1); }

// ✅ 后：删 CSS，14/20 生效
<Text as="span" size="2" className="choice-label">
.choice-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

**`Text` 与 `Heading` 的同一 `size` 不等价**：`Heading` 行高走 `--heading-line-height-N`，
size 2–5 比 `Text` 紧 2px。`<Heading size="2">` 是 14/18，`<Text size="2">` 是 14/20；size 1 与 6–9 两者相同。
这是 Radix 的设计，不是偏差——把标题从 CSS 手写改成 `size` 时行高会跟着变，属预期。

**判断口径**：只要元素是 `Text` / `Heading` / `Badge` 且能挂 `size`，CSS 里就不该出现
`font-size`、`line-height`、`letter-spacing`、`font-weight` 四条中的任何一条；`font-weight` 一律换 `weight`。
字号设在 `Flex` / `Grid` 容器上靠继承的，也要下沉到最内层 `Text`。
**唯一例外**：第三方组件的类名拿不到 prop（`date-picker.css` 里的 `.rdp-caption_label` /
`.rdp-weekday` / `.rdp-day_button`）。另有两类 `font-weight` 留在 CSS 属合理：状态强调
（`.choice-cell[data-selected='true'] .choice-label`、`.data-row[data-state='network'] .data-row-status`）。

**已修**：18 个文件、116 条声明；`font-size` 与 `letter-spacing` 现仅剩 `.rdp-*` 3 处。

---

## 2. 重造 Radix 已有组件

### 2.1 手写 Card

**现象**：`Panel` 与 `.settings-card` 各自手写 `background + border + border-radius + box-shadow`，
两者圆角（14px / 10px）与阴影还不一致。

**改法**：`Card variant="surface"` + 共享工具类 `.app-card`。Card 没有 radius / padding prop，
只能覆盖它的变量，所以变量覆盖集中在一处，使用方只声明取值：

```tsx
// ✅ 后（components/panel/panel.tsx）
<Card variant="surface" className={cn('app-card', 'panel', className)}>

// ✅ 后（features/settings/components/settings-group.tsx）
<Card variant="surface" className="app-card settings-card">
```

```css
/* ✅ index.css：Card 没暴露成 prop 的部分集中补齐，使用方不再各写一遍 */
.app-card {
  --base-card-padding-top: 0;
  --base-card-padding-right: 0;
  --base-card-padding-bottom: 0;
  --base-card-padding-left: 0;
  --base-card-border-radius: var(--app-card-radius, var(--radius-4));
  --base-card-surface-box-shadow: 0 0 0 1px var(--app-border);
  --card-background-color: var(--app-surface);
  box-shadow: var(--app-card-shadow, none);
}
```

**代价**：Card 的描边是 inset ring，不像 `border` 那样占布局，所以卡片高度会少 2px、内容内缩少 1px。
如果哪天要求严格 0 差异，只能放弃 Card 回到真实 `border` —— 那就没有收益了。

### 2.2 手写按钮 / 徽标

```tsx
// ❌ 前（choice-list.css .share-badge）：三态 span + data-tone 三套颜色
// ✅ 后（plant-machine-picker.tsx）
<Badge variant="soft" color={SHARE_TONE_COLOR[badge.tone]} className="share-badge">

// ⛔ 保留（excel.css .upload-cta）：看着像 Button，实则不是
//    它是 <label> 里的视觉提示，不是独立控件；换成 Button 要覆盖高度/内距/圆角/hover
//    共 5~6 处，比现在更绕，还会引入嵌套可交互元素。见 docs/radix-themes-audit.md 3.3
```

**别只凭「长得像」就替换**：先量一下尺寸档位。Radix 的 Button 高度只有 24 / 32 / 40，
Badge 最小字号 12px；比这些更小的控件，硬换要付的覆盖成本往往高于收益。

### 2.3 手写表格

`scan.css` 的 `.data-list-head` / `.data-row` 用 `Grid` + `grid-template-columns` 手搓三列表格。
`Table.Root` 已经能满足（`sheet-table-preview.tsx` 就是正例）；当前 hover / 状态色定制较多，
迁移成本中等，**列为可选优化**。

---

## 3. 裸元素承载布局

```tsx
// ❌ 前（settings-group.tsx）
<section id={id} className="settings-group">
  <Heading>…</Heading>
  <div className="settings-card">{children}</div>
</section>

// ✅ 后
<Box id={id} className="settings-group">
  <Heading mb="10px">…</Heading>
  <Box className="settings-card">{children}</Box>
</Box>
```

```tsx
// ❌ 前（update-settings-section.tsx）
<div className="settings-card-footer update-state" aria-live="polite">
// ✅ 后
<Flex className="settings-card-footer" direction="column" gap="10px" px="16px" py="14px" aria-live="polite">
```

**注意**：`Box` 的 `as` 只支持 `"div" | "span"`，想要 `<section>` 语义不能用 `as="section"`；
真要语义化包装，就用 `Section` 组件或保留原生标签并说明理由。

**允许的裸元素**：`button`（历史摘要行）、`label` / `input`（Excel 上传区）、
`details` / `summary`（快捷方式折叠）——语义必需，不在禁止范围。

---

## 4. 自定义滚动，忽略 ScrollArea

```tsx
// ❌ 前（app-sidebar.css）
.sidebar-nav { flex: 1; min-height: 0; overflow-y: auto; }
<Box className="sidebar-nav" role="navigation">

// ✅ 后
<ScrollArea className="sidebar-scroll" type="auto" scrollbars="vertical" role="navigation">
  <Box px="12px" pt="6px" pb="16px">…</Box>
</ScrollArea>
// css 只留弹性（ScrollArea 不转发 flexGrow/minHeight）
.sidebar-scroll { flex: 1; min-height: 0; }
```

**注意**：`ScrollArea` 只接受 `type` / `scrollbars` / `radius`，**不转发** `flexGrow` / `minHeight` /
`padding`。padding 要给内层 `Box`，弹性只能留在 CSS 并写注释。

**合规例外**：`help-tip.css` 的 `Popover.Content { overflow-y: auto }`——Popover 没有 overflow prop。

---

## 5. 显式写默认值

```tsx
// ❌ 前：size="2" 是 Button / Text 的默认值，写了等于噪音
<Button size="2" variant="solid">
// ✅ 后
<Button variant="solid">
```

**例外**：`Text` / `Heading` / `Badge` 的 `size` 不适用这条——即使等于默认档也要显式写，
它是字号、行高、字距的唯一来源。只有 `Button size="2"` 这类纯尺寸默认值才是噪音。

---

## 6. 多余嵌套与空规则

```tsx
// ❌ 前（panel.tsx）：Flex > Box(min-width) > Flex > Flex(icon)，四层才渲染标题行
<Flex className="panel-header">
  <Box className="panel-header-main">
    <Flex className="panel-title-row">…

// ✅ 后：main 换成带 props 的 column Flex，省掉一层，样式不再依赖 class
<Flex align="start" justify="between" gap="4" pt="18px" px="20px">
  <Flex direction="column" minWidth="0">
    <Flex align="center" gap="2">…
```

```css
/* ❌ 前：规则删空了还留着 class 名与 import */
.progress-head { /* 布局走 props */ }

/* ✅ 后：整条规则删除，tsx 里的 className 一并删；CSS 文件若全空，连文件与 import 一起删 */
```

**删空规则时要连 className 一起清**：这一轮删规则后留下了 `.field-label`、`.panel-section-title`、
`.inline-hint`、`.sidebar-meta` 四个孤儿 className——规则没了，tsx 还挂着 class，
下一个人会以为「它有样式，只是没找到」。`.inline-hint` 因为还有 `.inline-hint svg` 在用，
class 必须留着，这种要写注释说明是谁在消费它。

---

## 7. 显式写默认值（补充：`size` 的例外）

第 5 节讲过 `Button size="2"` 是噪音。这一轮把清单补全，并划清与第 1.1 节的边界：

| 组件      | 默认值                                           | 写了算噪音？ |
| --------- | ------------------------------------------------ | ------------ |
| `Text`    | `as="span"`，**无默认 size**（继承 16px）        | `as` 算，`size` 不算 |
| `Heading` | `as="h1"`，`size="6"`                            | `as` 算，`size` 不算 |
| `Badge`   | `size="1"`                                       | 算           |
| `Button`  | `size="2"`，`variant="solid"`                    | 都算         |
| `Flex`    | `as="div"`，`display="flex"`，`direction="row"`  | 都算         |

**为什么 `size` 例外**：它是字号、行高、字距的唯一来源（第 1.1 节），即使正好落在默认档也必须写上，
否则下一个人不知道这里到底是有意取默认还是漏了。

> 旧版 `SKILL.md` 曾写「`Text size="2"` 是默认值」——**这是错的**，`Text` 没有默认 `size`，不写即继承 16px。
> 已更正。

---

## 8. 文字塞进布局组件

**现象**：`<Flex>一段说明</Flex>`、`<Box>{label}</Box>`、`<span className="panel-description">{text}</span>`。
文字是布局组件的直接子节点，样式靠容器上的 `color` / `font-*` 继承下来。

**成因**：迁 props 时只关心「盒子怎么摆」，把文字当成盒子的一部分一起搬。
`Box` / `Flex` 确实能渲染任意子节点，看不出错。

**为什么危险**：`color` / `weight` / `align` / `size` 都在 `Text` 的 API 里，容器没有这些 prop。
文字挂在容器上后，排版语义只能由 CSS 猜——靠继承或后代选择器，一旦容器里有多个子节点就分不清
谁该是什么颜色，于是又长出 `[data-state]` 这类挂点。这条链是从「文字放错层」开始的。

```tsx
// ❌ 前（plant-machine-picker）：文字直接挂在 Box 上，颜色靠 .skipped-list 的 color
<Box className="skipped-list">未扫描的机台：{list.join('、')}</Box>
.skipped-list { color: var(--gray-11); }

// ✅ 后：文字进 Text，颜色用它自己的 prop
<Flex className="skipped-list" direction="column" gap="1">
  <Text as="span" size="1" color="gray">{intro}</Text>
  …
</Flex>
```

**判断口径**：JSX 里凡是布局组件的子节点，只要是有语义的文案（不是图标、不是另一个组件），
就必须包一层 `Text` / `Heading` / `Strong` / `Code`。`aria-label`、`title` 里的字符串不算。

**已修**：`plant-machine-picker` 的跳过列表、`plant-filter-panel`、`scan-task-panel` 的进度值、
`history-panel` 的时间与统计、`panel` 的描述、`field` 的标签。

---

## 9. 一个容器干多件事

**现象**：一条 class 里既有 `display: flex` / `gap` / `padding`，又有 `border` / `background` / `color`，
一个元素同时负责排版、布局和外观。

**成因**：从设计稿逐条抄样式，一个盒子看着就是一个盒子，自然写在一起。
在没有 props 的世界里这是对的，有 Radix 之后布局部分就该搬走。

**为什么危险**：布局声明与 `Flex` / `Grid` 的 props 是同一个属性的两处真相，
项目 CSS 后加载，CSS 静默赢——prop 变成死的，改 prop 毫无反应（见第 1 节）。
而且这种写法没法复用：想换个对齐就得复制整条规则。

```tsx
// ❌ 前（excel.css .upload-cta）：排版 + 布局 + 外观，一条规则全包
.upload-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: center;
  padding: 4px 12px;
  border: 1px solid var(--gray-a6);
  border-radius: var(--radius-2);
  background: var(--app-surface);
  color: var(--gray-12);
}

// ✅ 后：Flex 管方向 / 对齐 / 间距；剩下的只管这个盒子的外观
<Flex className="upload-cta" display="inline-flex" align="center" gap="2">
.upload-cta {
  align-self: center;              /* Flex 没有 alignSelf prop */
  margin-top: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--gray-a6);
  border-radius: var(--radius-2);
  background: var(--app-surface);
  box-shadow: 0 1px 1px var(--gray-a3);
}
```

**判断口径**：规则里出现**裸**的 `display` / `flex-direction` / `align-items` / `justify-content` / `gap` / `padding`，
且元素是 Radix 布局组件，就是违规。判据是「有没有裸布局声明」，不是「声明条数」——
一条 `display: flex` 和十条一样违规。

**迁移前必做的一步**：先量原生效值。`gap: 8px` 对应 `gap="2"` 不是 `gap="1"`；
`padding: 7px 9px` 在尺度上没有对应档位，写 `p="7px 9px"` 保留原值，不要硬凑 `p="2"`。

**已修**：`field`、`empty-state`、`stat`、`choice-list`、`panel`、`scan`、`copy`、`excel`、
`settings`、`history`、`app-sidebar`、`app-layout`。

---

## 10. 颜色留在容器上

**现象**：容器 CSS 里写 `color: var(--gray-11)`，里面所有文字跟着变色；或者为了让某一行变红，
给容器挂 `data-state="network"`，再写 `.row[data-state='network'] { color: var(--red-11) }`。

**成因**：这是第 8 节的延续。文字不上 `Text`，颜色就没地方挂，只能挂在容器上靠继承，
再靠后代选择器做状态区分。

**为什么危险**：`Text` 有 `color` prop，容器的颜色是一份平行的、看不见的真相。
换组件、加一层嵌套、改 `display` 都可能导致继承断掉，而代码上完全看不出来。

```tsx
// ❌ 前（scan-task-panel）：容器挂 data-state，CSS 三套状态色
<Grid className="data-row" data-state={row.state}>
.data-row[data-state='network'] .data-row-status { color: var(--red-11); }
.data-row[data-state='warn'] .data-row-status { color: var(--amber-11); }

// ✅ 后：语气 → 颜色的翻译集中在一张表里，文字用自己的 color prop
const STATUS_TEXT_COLOR = { danger: 'red', warn: 'amber', success: 'gray', muted: 'gray' }
<Text as="span" size="1" color={STATUS_TEXT_COLOR[row.tone] ?? 'gray'}>{row.statusText}</Text>
```

**好处**：改一个语气只改表里一行，不用翻 CSS 选择器；`data-state` 这种只为上色存在的挂点可以整条删掉。

**三个必须留在 CSS 的情形**（都有具体技术原因，不是偷懒）：

| 情形                       | 例子                                                  | 原因                                             |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `Text` 给不到 9 / 10 阶    | `.stat-label`（gray-10）、`.stat-unit`（gray-9）      | 具名色 = 11 阶，`highContrast` = 12 阶，中间无档 |
| 响应祖先状态               | `.upload-zone:hover .upload-cta-label`                | `Text` 的 `color` 是静态 prop，`color` 不能读 `:hover` |
| 给 svg / 图形上色          | `.nav-icon`、`.inline-hint svg`、`.status-dot`        | 那不是文字，`Text` 管不到                        |

**另一个坑**：`Text color="indigo"` 渲染的是 `--indigo-a11`（alpha 版），
实测 `rgba(0, 43, 183, 0.773)`，不是实色 `--indigo-11`。这是 Radix 的设计（彩色文字带透明度以适配背景），
看到颜色「有点透」不要以为是 bug，也不要覆盖。

**`Text` 没有「跟随主题强调色」的选项**：`app.tsx` 是 `accentColor="indigo"`，但 `color` 只接受具名色名，
所以 `stat.tsx` 里硬编码 `'indigo'` 并留了注释——改主题时必须同步改那一行。

---

## 11. 把 CSS 简写塞进 props

**现象**：`p="2 4"`、`p="6 4"`、`p="1 2"`、`p="2 2 1"`。看起来像 CSS 的 `padding: 8px 16px`，读代码时觉得没问题。

**成因**：Radix 的 spacing props 类型是 `enum | string`，注释里写着「Supports space scale values, CSS strings」。于是很自然地以为字符串就是 CSS 值，简写也成立。

**为什么危险**：Radix 把字符串原样写进 CSS 变量，再由固定规则消费：

```html
<!-- p="2 4" 编译成 -->
<div class="rt-r-p" style="--p: 2 4">
```

```css
.rt-r-p { padding: var(--p); }   /* → padding: 2 4; 缺单位，整条声明被丢弃 */
```

结果是 `padding: 0px`——**不是报错，是静默变成 0**。TypeScript 不会拦（类型允许任意 string），
code review 也看不出（`2 4` 在 CSS 里是合法写法），只有量 `getComputedStyle` 才会发现。
更糟的是它「看起来像生效了」：设置了 `minHeight` 的行还有留白，会让人以为是 padding。

```tsx
// ❌ 前（settings-row.tsx）：文字与控件完全贴到卡片边框
<Flex className="settings-row" gap="5" minHeight="52px" p="2 4">
// 实测 padding: 0px，--p: 2 4

// ✅ 后：拆成方向 prop，值仍取尺度档位
<Flex className="settings-row" gap="5" minHeight="52px" py="2" px="4">
// 实测 padding: 8px 16px
```

```tsx
// ❌ 三值简写同样失效（app-sidebar 的状态行）
<Flex p="2 2 1">
// ✅ 拆成 pt / pb / px
<Flex pt="2" pb="1" px="2">
```

**判断口径**：`p` / `px` / `py` / `pt` / `pr` / `pb` / `pl` 的值只能是**单个**档位（`"4"`）或**带单位的完整 CSS 值**
（`"16px"`、`"8px 16px"`）。多值简写一律拆成方向 prop，因为拆开之后每一档还能各自对齐尺度表。

```bash
# 自查命令：有输出就是漏了
grep -rnE '\b(p|px|py|pt|pr|pb|pl)="[0-9]+ [0-9]' src/renderer --include=*.tsx
```

**已修 8 处**：`settings-row`（`2 4`）、`empty-state`（`6 4`）、`copy-panel`（`1 2`）、
`copy-progress`（`2 3`）、`history-panel` ×2（`2 3`）、`scan-task-panel`（`1 2`）、
`app-sidebar`（`2 2 1`）。修完实测：`.settings-row` = `8px 16px`、`.empty-state` = `32px 16px`、
侧边栏状态行 = `8px 8px 4px`。

**顺带修正的文档错误**：`docs/radix-themes-audit.md` 第 12 章的验证表曾记「`.empty-state` padding 34px 20px」，
那是从旧 CSS 抄的值，实际一直是 0。教训是——**验证表里的数字必须来自当前渲染，不能从源码推算**。

---

## 12. `Text` 被当成盒子用

**现象**：CSS 给挂在 `Text` 上的 class 写了 `padding`、`border`、`background`，或者写了 `display: block` 只为了让 `margin-top` 生效。

**成因**：以为「`Text` 没有布局属性，所以只能靠 CSS 硬写，或者包一层 `Box`」。两个前提都不对：

- `Text` **有**完整的 margin prop（`m` / `mx` / `my` / `mt` / `mr` / `mb` / `ml`）。官方文档首句就写着 supports common margin props，TS 类型是 `extends MarginProps`，实现里 `extractProps(props, textPropDefs, marginPropDefs)` 把 margin 作为第二个 prop 组。**官方 prop 表不列它**，因为 margin 是通用 prop，归在 overview/layout 下——表里没有不等于不支持。
- `Text` **有** `as="div"`（自带 block）和 `truncate`（自带截断三件套），这两类需求都不需要写 CSS。

**判据**：看盒子**有没有可见边界**。无背景无描边时 `padding` 与 `margin` 渲染位置完全一致，直接换 `m*` prop；有背景/描边时它本来就该是 `Box`，不是「绕开限制」。

```tsx
// ❌ 前：padding 写在 Text 的 class 上，或为了 margin 强加 display: block
<Text className="nav-group-label">找图</Text>
<Text className="stat-value">1,204</Text>
```
```css
.nav-group-label { padding: 0 var(--space-2) var(--space-2); color: var(--gray-9); }
.stat-value {
  display: block;
  margin-top: var(--space-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

```tsx
// ✅ 后：间距走 prop，块级走 as，截断走 truncate
<Text as="div" mx="2" mb="2" className="nav-group-label">找图</Text>
<Text as="div" truncate className="tabular">{value}</Text>
```
```css
.nav-group-label { color: var(--gray-9); }
/* .stat-value 整条删除 */
```

**反面：该包的时候要包。** `.sheet-footer` 有 `border-top` 分隔线，文字必须被推离这条线——这是有边界的盒子：

```tsx
// ❌ 前：Text 同时承担文字与盒子
<Text as="p" className="sheet-footer">还有 10 行未显示</Text>
/* .sheet-footer { padding: var(--space-2) 0; border-top: 1px solid var(--gray-4); } */

// ✅ 后：Box 管盒，Text 管字
<Box className="sheet-footer" py="2">
  <Text as="p" align="center" size="1" color="gray" className="tabular">
    还有 10 行未显示
  </Text>
</Box>
/* .sheet-footer { border-top: 1px solid var(--gray-4); } */
```

**别为了 4px 内边距包一层。** 多一层 DOM、改变 flex 上下文、`truncate` 的参考宽度变了、hover 热区归属变乱。最要命的是它掩盖了归属错误——给文字加内边距，多数时候该调的是祖容器的 padding。

**验证方法上的坑**：用 CDP 构造同构节点量 `getComputedStyle` 时，节点必须 append 在 `.radix-themes` **内部**。挂到 `<body>` 上会读到 `padding: 0px`——因为 `--space-2` 定义在 `.radix-themes` 上，没继承出来，`var(--space-2)` 解析失败。我在这上面浪费了一轮排查。

**已修 4 处**：`nav-group-label`、`sheet-footer`、`stat`（两格）、`file-meta-item`。顺带删掉 `.file-meta` 的三条与 `<Grid columns="3" gap="2">` 逐字重复的声明。

---

## 13. 改完的验证

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

再逐页目测：四个扫描页、Excel 解析、设置页、历史记录展开态、侧边栏滚动。
双写类改动**只应看到极小的像素差异**（本次全部按 CSS 原生效值迁 props，视觉不变）；
如果某处明显变了，说明 props 值算错（Radix `gap="2"` = 8px，不是 2px）。
