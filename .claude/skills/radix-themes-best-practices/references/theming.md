# 主题定制

`Theme` 是全局唯一的外观来源。这份文件回答：**能改什么、改了影响谁、改了之后哪里会跟着变。**

> 版本基准 `@radix-ui/themes@3.x`。标「源码」的结论直接来自包内 `src/`，与官方文档的表述有出入的地方单列在文末。

## 目录

1. [Theme 的全部开关](#1-theme-的全部开关)
2. [根节点只写偏离默认值的 prop](#2-根节点只写偏离默认值的-prop)
3. [radius：六档到底是多少像素](#3-radius六档到底是多少像素)
4. [scaling：缩放什么、不缩放什么](#4-scaling缩放什么不缩放什么)
5. [accentColor 与 grayColor 的联动](#5-accentcolor-与-graycolor-的联动)
6. [嵌套 Theme：合法但有三处反直觉](#6-嵌套-theme合法但有三处反直觉)
7. [面板背景：panelBackground 管不到弹窗](#7-面板背景panelbackground-管不到弹窗)
8. [令牌速查](#8-令牌速查)
9. [不要重写主题已经分发的值](#9-不要重写主题已经分发的值)

---

## 1. Theme 的全部开关

| prop | 默认值 | 可选值 | 影响面 |
|---|---|---|---|
| `appearance` | `inherit` | `light` / `dark` / `inherit` | 整套颜色令牌；`inherit` 时不加 `light`/`dark` 类，跟随祖先或 `:root` |
| `accentColor` | `indigo` | 26 个具名色 | `--accent-*` 全部阶位、`--focus-8` |
| `grayColor` | `auto` | 6 个灰阶 + `auto` | `--gray-*` 全部阶位 |
| `radius` | `medium` | `none` / `small` / `medium` / `large` / `full` | `--radius-1`–`6`、`--radius-full` |
| `scaling` | `100%` | `90%` / `95%` / `100%` / `105%` / `110%` | 间距、字号、行高、圆角（见 §4） |
| `panelBackground` | `translucent` | `solid` / `translucent` | 只影响消费 `--color-panel` 的 `Card` 与 `Table`；`Popover` / `HoverCard` / `Select` 写死 `--color-panel-solid`（源码） |
| `hasBackground` | `true`；嵌套层**显式**给了 `appearance` 时也为 `true`（否则不铺） | `boolean` | 是否在本层铺背景色 |
| `asChild` | `false` | `boolean` | 不额外包 `<div class="radix-themes">` |

> **文档 vs 源码**：官方文档说 `appearance` 默认 `light`，源码是 `inherit`。差别在于你**没写** `appearance` 时，深色系统里界面会跟着变深色——产品只做浅色时必须显式写。

`<ThemePanel />` 是开发期调参浮层（默认打开），能实时改上面这些值并「复制配置」。**上线前移除**——官方把它当开发工具，但线上没人该看到它。

### 1.1 根 Theme 六大维度全树传递与派生网络

根 `<Theme>` 组件（DOM 挂载为 `.radix-themes`）并非单纯的 React Context，而是**整套 CSS 变量设计令牌的发生器与分发器**。它向 DOM 树向下级联分发 6 个维度的层叠系统：

| 维度 | 根节点下发的变量与机制 | 后代继承与派生行为 | 实践约束 |
|---|---|---|---|
| **Color** (颜色) | `--color-background`, `--gray-1`~`12`, `--accent-1`~`12` | ① `.radix-themes` 根节点设置 `color: var(--gray-12)`，后代正文文字**默认自动继承高对比文字色**；<br>② `Button`、`Badge`、`Switch`、`Slider`、`Radio` 等控件**默认自动消费根 accentColor**；<br>③ `Card` 与 `Table` 默认底色派生自 `--color-panel`。 | 不要给每个 `<Text>` 重复传 `color`（主正文不用传，次级文字才传 `color="gray"`）；不要给控件重复传 `color="indigo"`。 |
| **Typography** (排版) | `--default-font-family`, `--code-font-family`, `--heading-font-family` | ① 字体栈沿 DOM 树自然级联；<br>② `Strong`、`Em`、`Quote` 无 `size` prop，原生通过 `font-size: 1em` 继承父级文字字号；<br>③ `<Text>` 没有默认 size（显式继承父级字号），因此 `<Text>` 必须显式声明 size。 | 换全站字体覆盖 `--default-font-family` 变量即可，严禁在组件 class 上写 `font-family`。 |
| **Spacing** (间距) | `--space-1` ~ `--space-9` (4px ~ 64px) | 全树变量可达。布局构建块（`Box`、`Flex`、`Grid`）的 `gap` 与 `p` 消费这些变量；受 `scaling` 统一比例缩放。 | 严禁手写固定间距（如 `gap: 12px`），使用档位 prop（如 `gap="3"`）。 |
| **Radius** (圆角) | `--radius-1` ~ `--radius-6`, `--radius-full` | 根 `radius`（默认 `medium`）自动向整棵子树派生各阶圆角。所有组件（`Button`、`Card`、`Badge`、`TextField` 等）自动引用对应阶位。 | 后代严禁传 `radius="medium"` 等默认值；统一调整圆角在根节点配一次。 |
| **Shadows** (阴影) | `--shadow-1` ~ `--shadow-6` | 全局下发。`Card variant="classic"` 以及浮层组件（`Dialog`、`Popover`、`DropdownMenu` 等）内部自动消费对应的阴影阶位。 | 严禁针对组件手动写 `box-shadow` 覆盖层，全走主题阴影。 |
| **Cursors** (光标) | `--cursor-button`, `--cursor-checkbox`, `--cursor-link`, `--cursor-disabled` 等 | 沿树级联。所有按钮、复选框、单选、开关默认遵循原生桌面标准（`default` 箭头）。 | 全局改手型在 `:root` 覆盖 `--cursor-button: pointer;`，禁止针对组件类名写 `cursor: pointer`。 |

---

## 2. 根节点只写偏离默认值的 prop

```tsx
import '@radix-ui/themes/styles.css'
import { Theme } from '@radix-ui/themes'

// ✅ 只写默认值以外的两项
export default function App() {
  return (
    <Theme appearance="light" grayColor="slate">
      <YourApp />
    </Theme>
  )
}
```

```tsx
// ❌ 五个 prop 里三个与默认值逐字相同
<Theme appearance="light" accentColor="indigo" grayColor="slate" radius="medium" scaling="100%">
```

**为什么**：写了不产生效果，却让人以为「这里有个需要维护的开关」。下次有人调圆角会先来改这一行——而默认值写上去只是噪音。

**`grayColor="slate"` 不是冗余**：默认是 `auto`，显式写它是为了钉死中性色，避免以后改 `accentColor` 时连带换灰阶（见 §5）。

**后代组件更不该写 `radius` / `accentColor` / `scaling` / `appearance`**：全部从根继承，重复写等于给主题开第二个开关。

---

## 3. radius：六档到底是多少像素

官方文档只展示视觉效果，**没有像素表**。以下是源码计算结果（`scaling = 100%`）：

| `radius` | factor | `--radius-1` | `-2` | `-3` | `-4` | `-5` | `-6` | `--radius-full` |
|---|---|---|---|---|---|---|---|---|
| `none` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0px |
| `small` | 0.75 | 2.25px | 3px | 4.5px | 6px | 9px | 12px | 0px |
| `medium`（默认） | 1 | 3px | 4px | 6px | 8px | 12px | 16px | 0px |
| `large` | 1.5 | 4.5px | 6px | 9px | 12px | 18px | 24px | 0px |
| `full` | 1.5 | 4.5px | 6px | 9px | 12px | 18px | 24px | **9999px** |

三条容易误解的：

1. **`full` 不会把每一档拉满**。它的 factor 与 `large` 完全相同，差别只是 `--radius-full: 9999px`。组件用 `max(var(--radius-2), var(--radius-full))` 才变胶囊——所以 `radius="full"` 只让**本来引用 `--radius-full` 的组件**（Badge、Button、TextField 等）变圆。
2. **`--radius-N` 里含 `var(--scaling)`**，scaling 调大会让圆角一起变大。
3. **组件级 `radius` 改的是 factor 不是像素**：`<Button radius="full">` 只影响这棵子树。

**怎么用**：不要四处写 `border-radius: 8px`。按「容器 → 区块 → 控件」分三级，全部引用令牌：

```css
/* 容器：卡片、侧边栏、内容区、导航项 */
border-radius: var(--radius-4);
/* 区块：统计块、列表、进度容器、图标底 */
border-radius: var(--radius-3);
/* 控件：可选项、小标签、路径条 */
border-radius: var(--radius-2);
```

圆形用 `50%`（那是形状不是圆角），胶囊用 `var(--radius-full)`。写死像素会切断与 `Theme` 的联动。

---

## 4. scaling：缩放什么、不缩放什么

`scaling` 只做一件事——给根节点设 `--scaling`（0.9 / 0.95 / 1 / 1.05 / 1.1）。

**会缩放**（全部乘了 `var(--scaling)`；像素值取自源码 `tokens/*.css`，官方页只给视觉示例）：

| 令牌 | 100% 时 |
|---|---|
| `--space-1` … `-9` | 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64 |
| `--font-size-1` … `-9` | 12 / 14 / 16 / 18 / 20 / 24 / 28 / 35 / 60 |
| `--line-height-1` … `-9` | 16 / 20 / 24 / 26 / 28 / 30 / 36 / 40 / 60 |
| `--heading-line-height-1` … `-9` | 16 / 18 / 22 / 24 / 26 / 30 / 36 / 40 / 60 |
| `--radius-1` … `-6` | 3 / 4 / 6 / 8 / 12 / 16 |
| 若干组件内尺寸 | `Section` 的内边距、复选框指示器、菜单箭头、表格行高 |

**不会缩放**：

- `--font-weight-*`（300 / 400 / 500 / 700）
- `--letter-spacing-*`（用 `em`，本身随字号）
- border-width（组件里硬编码 `1px`，**没有** `--border-width` 令牌）
- `--shadow-*`
- `--container-1`–`4`（448 / 688 / 880 / 1136）
- 断点像素值

**推论**：`scaling="110%"` 后，1px 边框仍是 1px，但所有间距变大 10%——观感上「边框变淡了」。Radix 把 scaling 定位成「用户舒适度微调」而非「整体缩放」，接受这个观感通常更省事。

---

## 4.1 Breakpoints 六档断点体系

Radix Themes 采用移动端优先（mobile-first）响应式系统，内建 6 档断点。在 props 传入响应式对象（如 `columns={{ initial: '1', md: '3' }}`）时，会映射为对应的断点媒体查询。

| 断点 Key | 最小宽度 (min-width) | 典型设备 |
|---|---|---|
| `initial` | 0px | 手机竖屏 / 默认移动端基准（**必填，不能写 base**） |
| `xs` | 520px | 大屏手机 / 小型折叠屏 |
| `sm` | 768px | 平板竖屏 |
| `md` | 1024px | 平板横屏 / 紧凑笔记本 |
| `lg` | 1280px | 桌面显示器 |
| `xl` | 1640px | 超宽大屏 |

在 CSS 中，Radix 样式表基于这些断点下发 `.rt-r-*` 类。自定义 CSS 如需与 Radix 断点保持严格一致，使用标准媒体查询如 `@media (min-width: 1024px)` 对应 `md` 档。

---

## 4.2 Cursors 光标体系与令牌

Radix Themes 的交互元素光标默认遵循**现代操作系统原生桌面规范**（与 macOS、Windows 原生控件一致），而不是传统 Web 习惯：

| 令牌名 | 默认值 | 作用组件 | 为什么默认是 default |
|---|---|---|---|
| `--cursor-button` | `default` | `Button`、`IconButton` | 桌面原生按钮是箭头指针；只有超链接才呈现手指指针 |
| `--cursor-checkbox` | `default` | `Checkbox` | 原生复选框 |
| `--cursor-radio` | `default` | `Radio` | 原生单选框 |
| `--cursor-switch` | `default` | `Switch` | 原生开关 |
| `--cursor-slider-thumb` | `default` | `Slider` 滑块 | 原生滑块 |
| `--cursor-menu-item` | `default` | 下拉菜单 / 上下文菜单项 | 原生菜单项 |
| `--cursor-link` | `pointer` | `Link` | 语义为跳转链接 |
| `--cursor-disabled` | `not-allowed` | 所有禁用状态控件 | 禁用提示 |

**如何统一为 Web 式手型光标**：
若产品要求按钮、复选框在 hover 时呈现手型（`pointer`），**严禁针对 `.rt-Button` 或业务 class 暴力写 `cursor: pointer`**（这会导致特异性污染并破坏禁用态的 `not-allowed`）。正确做法是在根样式表（如 `src/renderer/index.css`）中覆盖对应变量：

```css
/* ✅ 全局正解：覆盖光标令牌，自动联动所有按钮且保留 disabled 状态 */
:root {
  --cursor-button: pointer;
  --cursor-checkbox: pointer;
  --cursor-switch: pointer;
  --cursor-menu-item: pointer;
}
```

---

## 5. accentColor 与 grayColor 的联动

`grayColor="auto"`（默认）按 accentColor 挑一个协调的灰阶：暖色配暖灰，冷色配冷灰。

| accent | 解析出的灰阶 |
|---|---|
| tomato / red / ruby / crimson / pink / plum / purple / violet | `mauve` |
| iris / indigo / blue / sky / cyan | `slate` |
| teal / jade / mint / green | `sage` |
| grass / lime | `olive` |
| yellow / amber / orange / brown / gold / bronze | `sand` |
| gray | `gray` |

**三条实用推论**：

1. **改 accentColor 会连带改灰阶**。设计稿定了中性色就得显式写 `grayColor`，否则换成 `green` 时所有灰文字一起变暖。
2. **冷灰 + 暖强调色合法**：`accentColor="orange" grayColor="slate"`。
3. 灰阶只有 6 个可选：`gray` / `mauve` / `slate` / `sage` / `olive` / `sand`。

---

## 6. 嵌套 Theme：合法但有三处反直觉

嵌套 `<Theme>` 是官方支持用法，适合「局部区域换一套强调色」。但继承规则有两个坑：

| prop | 嵌套层未传时 | 注意 |
|---|---|---|
| `appearance` | 继承父级的**原始值**（可能是 `inherit`） | 父级没定，子级也没定 |
| `accentColor` | 继承父级 | — |
| `grayColor` | 继承父级**已解析**的灰阶 | ⚠ **不是** `auto` |
| `panelBackground` / `radius` / `scaling` | 继承父级 | 只想改颜色也会一起继承 |
| `hasBackground` | 嵌套层未传时：显式给了 `appearance` 才铺背景，否则不铺 | 不铺时父级背景透过来 |

### 6.1 坑一：嵌套层改 accent，灰阶不跟着重算

```tsx
<Theme accentColor="green">          {/* gray 解析为 sage */}
  <Theme accentColor="blue">         {/* ⚠ 灰阶仍是 sage，不是 slate */}
```

因为内层 `grayColor` 默认取父级**已经算好的** `sage`，而不是 `'auto'`。想让灰阶重新匹配必须显式写：

```tsx
<Theme accentColor="blue" grayColor="auto">  {/* → slate */}
```

产品已经钉死 `grayColor`（§2 的推荐做法）时，这个坑不存在——这也是显式写 `grayColor` 的第二个理由。

### 6.2 坑二：多包了一层 div

嵌套会再包一个 `<div class="radix-themes">`。不想要多余节点就用 `asChild`：

```tsx
<Theme accentColor="crimson" asChild>
  <section className="promo">…</section>
</Theme>
```

### 6.3 坑三：为一个按钮嵌套整个 Theme

```tsx
// ✅ 组件自己的 color 只影响它自己
<Button color="crimson">删除</Button>

// ❌ 为一个按钮包了整个子树
<Theme accentColor="crimson"><Button>删除</Button></Theme>
```

---

## 7. 面板背景：`panelBackground` 管不到弹窗

`panelBackground` 只控制 `--color-panel`（面板色）。源码里消费它的只有 `Card` 与 `Table`，所以这个开关的实际作用面很窄。

`Popover` / `HoverCard` / `Select` 用写死的 `--color-panel-solid`；`Dialog` / `AlertDialog` / `DropdownMenu` / `ContextMenu` / `Tooltip` 各有自己的背景令牌——它们都不受 `panelBackground` 影响。

```tsx
// ❌ 想改弹窗背景，调 panelBackground 没用
<Theme panelBackground="solid">

// ✅ 直接改那个变量
<Theme style={{ '--color-panel-solid': 'var(--gray-1)' }}>
```

另一个副作用：`translucent` 带 `backdrop-filter`，大量堆叠时可能掉帧。纯色设计用 `solid` 更省。

---

## 8. 令牌速查

| 类别 | 令牌 | 值 |
|---|---|---|
| 间距 | `--space-1`…`-9` | 4/8/12/16/24/32/40/48/64 |
| 字号 | `--font-size-1`…`-9` | 12/14/16/18/20/24/28/35/60 |
| 字重 | `--font-weight-light` / `regular` / `medium` / `bold` | 300 / 400 / 500 / 700 |
| 行高 | `--line-height-1`…`-9` | 16/20/24/26/28/30/36/40/60 |
| 圆角 | `--radius-1`…`-6`、`--radius-full` | 见 §3 |
| 强调色 | `--accent-1`…`-12`、`--accent-a1`…`-a12`、`--accent-contrast`、`--accent-surface` | 实色 / alpha / 对比色 / 表面色 |
| 灰阶 | `--gray-1`…`-12`、`--gray-a1`…`-a12` | 实色 / alpha |
| 焦点 | `--focus-1`…`-12`、`--focus-a1`…`-a12` | 焦点环用 8 阶（`--focus-8`） |
| 阴影 | `--shadow-1`…`-6` | 越深越大 |
| 容器 | `--container-1`…`-4` | 448/688/880/1136 |
| 字体 | `--default-font-family`、`--code-font-family`、`--heading-font-family`、`--strong-font-family`、`--em-font-family`、`--quote-font-family` | 要换字体栈就覆盖这些变量 |

**颜色的 12 阶按用途选，不按深浅感觉选**：

| 阶 | 用途 |
|---|---|
| 1–2 | 页面 / 卡片背景 |
| 3–5 | 组件背景（默认 / hover / active） |
| 6–8 | 边框（弱 / 中 / 焦点） |
| 9–10 | 实色背景（solid 按钮） |
| 11 | 低对比文字（次要文字） |
| 12 | 高对比文字（正文、标题） |

> 带 `a` 的阶（`--accent-a11`）是 alpha 版，会与背景混合。Radix 的**彩色文字默认就用 alpha 版**，看起来比实色浅——这是设计意图，不要拿 `--accent-11` 去覆盖它。

---

## 9. 不要重写主题已经分发的值

判据只有一条：**删掉这条声明，`getComputedStyle` 是否一模一样。** 一样就是冗余。

| 形态 | 例子 | 为什么冗余 |
|---|---|---|
| 组件默认 prop | `accentColor="indigo"` `radius="medium"` `scaling="100%"` | 与默认值逐字相同 |
| 已被 reset 归零的盒模型 | `.card-title { margin: 0 }` | `.rt-Text` / `.rt-Heading` 本来就是 `margin: 0` |
| 已由根继承的文字色 | `.card-title { color: var(--gray-12) }` | `.radix-themes` 根本来就是 `gray-12` |
| 已由组件算出的圆角 | `--base-card-border-radius: var(--radius-4)` | `Card` 默认 `size="1"`（以及 `size="2"`）算出来正是它 |

**反向边界**：`color: var(--gray-10)` 让说明文字更弱，**不是**冗余——`Text color="gray"` 只到 11 阶，10 阶表达不了。判据永远是实测，不是「看起来像默认值」。

### focus 环

Radix 组件自己用 `--focus-8` 画环，位置各不相同（Button 在元素上、TextField 在 `:focus-within` 的包装上、Radio 在 `::before` 上）。**不要写全局 `:focus-visible` 规则**——会盖掉组件规则，还会在输入框上叠出第二层环。

只为**原生可聚焦元素**（路由 `<a>`、上传 `<label>`、`<summary>`）补一条收窄规则：

```css
/* 用 --focus-8 而不是 --accent-8：前者在根作用域求值，后者在元素作用域求值 */
.app-shell :is(a, label, summary):focus-visible {
  outline: 2px solid var(--focus-8);
  outline-offset: 2px;
}
```

---

## 附：文档没写但源码如此

| 事项 | 文档怎么说 | 源码实际 |
|---|---|---|
| `appearance` 默认值 | `light` | `inherit`（根节点靠 `:root` 令牌呈现浅色） |
| `panelBackground` 范围 | 影响「面板、卡片、弹窗」 | 只影响 `Card` 与 `Table`；`Popover` / `HoverCard` / `Select` 写死 `--color-panel-solid`，弹窗另有令牌 |
| `hasBackground` 默认 | 未提嵌套层 | 根节点 `true`；嵌套层显式给 `appearance` 时也是 `true`，否则不铺 |
| `radius="full"` | 「全部变圆」 | 只把 `--radius-full` 设为 9999px，factor 与 `large` 相同 |
| `scaling` 范围 | 「间距、字号、行高」 | 还包括**圆角**；但不包括 border、shadow、容器宽度 |
| `grayColor="auto"` 映射 | 只说「自动配互补灰」 | 穷举 switch，见 §5 的表 |
| 嵌套 Theme 的 gray | 未提 | 继承父级**已解析**灰阶，不会重新匹配 |
| `Card` 默认尺寸 | 视觉示例多为 size 2 | 默认 `size="1"`（padding 为 12px，圆角为 `--radius-4`）；size 2 padding 为 16px，圆角同为 `--radius-4` |
| `Grid` 的 `columns` prop | 文档示例写数字与 CSS 字符串 | 纯数字（如 `"3"`）自动由 `parseGridValue` 展开为 `repeat(3, minmax(0, 1fr))`，原生支持数字、CSS 模板与断点对象 |
| 控件光标（Cursors） | 未单独解释默认值来源 | 遵循原生桌面端规范，默认 `--cursor-button: default`；全局改手型改令牌，不改类名 |
