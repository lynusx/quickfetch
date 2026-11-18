# 常见陷阱：症状 → 原因 → 改法

这份文件按**症状**索引。你在代码里看到一个可疑写法、或发现「样式不生效」「文字贴边」「列是歪的」，来这里查。

每条格式固定：**症状** / **原因** / **改法** / **怎么查出来**。
能自动检的给命令，检不出来的说明靠什么判断。
还没写、想先知道「怎么算好」的，看 [practices.md](practices.md) §4 验收。

## 目录

| # | 症状 | 能否自动检 |
|---|---|---|
| 1 | prop 写了不生效，改它没反应 | 半自动（对比 props 与 CSS） |
| 2 | 元素贴边，内边距像是 0 | ✅ |
| 3 | 字号不对 / 行高怪 / 字距乱 | ✅ |
| 4 | 文字截不断，省略号不出现 | 半自动 |
| 5 | 想用更浅的灰 → `color` 给不到 | 半自动 |
| 6 | 卡片和别的地方长得不一样 | 半自动 |
| 7 | 改了主题，某些地方没跟着变 | 半自动 |
| 8 | 手搓了一个已有组件 | ✅ |
| 9 | 嵌套 Theme 后颜色更怪了 | 半自动 |
| 10 | 验证时数字对不上 | 靠流程 |
| 11 | 想要的 prop 在 Themes 页找不到，于是自己实现 | 半自动 |
| 12 | `Tooltip` 悬浮在 `disabled` 元素上不出现 | 半自动 |
| 13 | `Select` 下拉菜单覆盖在按钮正上方 | 半自动 |
| 14 | 按钮 hover 不是手型光标，手写类名覆盖 | ✅ |
| 15 | 响应式断点写成 `base` 或 Tailwind 前缀导致失效 | ✅ |
| 16 | 与预设组件对抗：写大段 CSS 暴力覆盖内部结构 | ✅ |
| 17 | 绕过 Typography 的 color prop 在 CSS 中书写 11/12 阶颜色 | ✅ |
| 18 | 误以为 Text 无等宽能力，在 CSS 声明 font-family: var(--code-font-family) | ✅ |
| 19 | 绕过 align prop 在 CSS 中手写 text-align | ✅ |
| 20 | 忽视 ScrollArea 原生 size prop，手写 ::-webkit-scrollbar 定制滚动条 | ✅ |

---

## 1. prop 写了不生效，改它没反应

**症状**：`gap="2"` 实际渲染 6px；`p="3"` 实际是 0；`size="2"` 渲染成 12px。TypeScript、ESLint、code review 全都看不出来。

**原因（三条叠加）**：

1. Radix 的工具类 `.rt-r-*` 与组件基础样式 `.rt-*` 都是 **0-1-0**（整库把特异性封顶在 0-1-0，只有部分内部选择器用 `:where()` 归零），自定义类也一样低。
2. **样式表按加载顺序决定胜负**——项目 CSS 在 `@radix-ui/themes/styles.css` 之后加载，同特异性下后者赢。
3. props 生成的 class 与你的 class 挂在同一个元素上，**没有任何机制提示你「prop 被覆盖了」**。

```tsx
// ❌ 两个来源写同一个属性
<Grid className="choice-grid" gap="2">
```
```css
.choice-grid { display: grid; gap: 6px; }   /* 后加载 → prop 的 8px 永远不生效 */
```

**改法**：一个属性只有一个来源。

- 布局属性（`display` / `flex-*` / `gap` / `padding` / `width` / 对齐）写 props，从 CSS 删掉。
- 列数与网格模板优先使用 `Grid` 的 `columns` prop（原生支持 `"3"`、`"100px 1fr"` 与响应式对象）；表格列宽优先使用 `Table.Root layout="fixed"` + `Table.Cell width`。
- CSS 只留 props 表达不了的：`:hover`、`[data-state]`、`border`、`background`、`font-family`、`repeat(auto-fill, ...)`、`max-width` 的响应式组合。

**迁移前必做**：先量**原生效值**。`gap: 8px` 对应 `gap="2"`，不是 `gap="1"`。删 CSS 的依据是「换成 prop 后计算值不变」，不是「看起来差不多」。

**怎么查**：

```bash
# ① 找出「CSS 里声明了、tsx 里也可能用 prop」的类
#    先看某个组件类在 CSS 里有没有布局声明
grep -nE '^\s*(display|flex|grid|gap|padding|margin|align-items|justify-content|width|height)\b' \
  src/**/*.css

# ② 再看对应的 tsx 有没有传同名 prop（同上元素）
grep -n 'className="choice-grid"' -r src --include=*.tsx

# ③ 拿不准时实测
#    在 DevTools 里选中元素，看它同时挂了 rt-r-gap-2 与 choice-grid，
#    谁的声明被划掉，谁就是输家
```

**判断口诀**：同一个元素上，**既有 `.rt-r-*` 类、又有自定义 class、且两者都声明了同一属性 → 一定是双写**。

---

## 2. 元素贴边，内边距像是 0

**症状**：卡片里的文字紧贴边框；`padding` 计算值是 `0px`，但你明明写了 `p="2 4"`。

**原因**：间距 prop 的档位是**单个枚举**（`"0"`–`"9"`）。传 `"2 4"` 时它不被识别为档位，于是走「任意字符串」分支：

```html
<!-- p="2 4" 编译结果 -->
<div class="rt-r-p" style="--p:2 4">
```
```css
.rt-r-p { padding: var(--p); }   /* → padding: 2 4 → 缺单位 → 整条声明被浏览器丢弃 */
```

没有 `rt-r-p-2` 兜底，也没有任何警告。`px="16px 8px"` 更糟，两个方向各写一条非法声明。

**改法**：

```tsx
// ✅ 档位：分开写方向
<Box pt="2" pb="4" />
<Box py="2" px="4" />

// ✅ 任意值：单个合法 CSS 值
<Box pt="8px" pb="16px" />
<Box p="16px 8px" />   {/* 合法 CSS 简写，能用——但语义是「16 上下 8 左右」 */}
```

**不适用于 `gap`**：CSS 原生支持 `gap: row column` 双值，所以 `gap="2px 4px"` 是合法的。坏的是**「档位 + 多值」**这种混合，以及 padding 的多值。

**怎么查**：

```bash
# 档位形态的多值（有输出就是漏了）
grep -rnE '\b(p|px|py|pt|pr|pb|pl)="[0-9]( |$|[^"]* [0-9])' src --include=*.tsx

# 更宽：任何间距 prop 后面跟着两个数字
grep -rnE '\b(p|px|py|pt|pr|pb|pl)="[^"]*[0-9] +[0-9]' src --include=*.tsx
```

---

## 3. 字号不对 / 行高怪 / 字距乱

**症状**：写了 `size="2"` 却渲染成 12px；或者字号对了，行高却像挤在一起。

**原因**：`size` 不是只设 `font-size`，它一次设**三件套**——`font-size`、`line-height`、`letter-spacing`，通过局部变量 `--line-height` / `--letter-spacing` 下发。CSS 里再写其中任何一个，都会盖掉 prop，而因为项目 CSS 后加载，是静默生效。

更隐蔽的是**只覆盖一半**：CSS 写 `font-size: 13px` 但不写 `line-height`，结果是「字号自定义、行高还是 size 的」——介于两档之间的怪状态。

```tsx
// ❌
<Text size="2" className="row-label">{label}</Text>
.row-label { font-size: 12.5px; line-height: 1.4; letter-spacing: 0; }
```

**改法**：

- 没有 `size` 的组件先补 `size`，不要用 CSS 手搓一套字号。
- 要「再大一点」就用下一档，不要写 `13px`。
- 字重走 `weight`（`light` / `regular` / `medium` / `bold`），不要写 `font-weight: 600`。
- 真要例外（第三方库生成的 DOM 拿不到 prop），在注释里写明是哪一方的类名。

**怎么查**：

```bash
# CSS 里出现这些就是错的（date-picker 是第三方组件覆盖层，属已知例外）
grep -rnE '^\s*(font-size|letter-spacing|line-height|font-weight)\s*:' src --include=*.css \
  | grep -v 'date-picker'

# tsx 里写了 font-weight / fontSize 内联样式
grep -rnE 'fontWeight|fontSize|letterSpacing|lineHeight' src --include=*.tsx
```

用 stylelint 硬拦（把这条加进配置，跑 lint 就会报错）：

```js
// .stylelintrc.mjs
export default {
  rules: {
    'declaration-property-value-disallowed-list': {
      'font-size': ['/.*/'],
      'letter-spacing': ['/.*/'],
    },
  },
  overrides: [
    {
      // 第三方组件生成的 DOM 拿不到 size prop，只能消费令牌
      files: ['**/date-picker/*.css'],
      rules: { 'declaration-property-value-disallowed-list': null },
    },
  ],
}
```

---

## 4. 文字截不断，省略号不出现

**症状**：加了 `truncate`，长路径还是把布局撑开；或者文本被截断了，但另一处同款写法没截断。

**原因**：`truncate` 只是一组 CSS（`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`），它**需要有宽度上限**才生效。在 flex 布局里，flex item 默认 `min-width: auto`，不会小于内容的 min-content 宽度——于是文字先把父级撑开，再没什么东西可截。

**改法**：截断链上**每一层**都要能收缩。

```tsx
// ✅ 三件事同时成立
<Flex align="center" gap="2">                     {/* 1. 给了确定的宽度上下文 */}
  <Icon flexShrink="0" />                         {/* 2. 固定元素不参与压缩 */}
  <Flex direction="column" minWidth="0" flexGrow="1">   {/* 3. 中间层允许收缩 */}
    <Text size="2" truncate>{path}</Text>
  </Flex>
</Flex>
```

三种常见断点：

- 只加 `truncate`，中间层没 `minWidth="0"` → 不截断。
- 中间层有 `minWidth="0"`，但外层没宽度约束 → 外层先撑破窗口。
- `truncate` 加在外层 `Flex` 上（而不是 `Text` 上）→ 文字所在元素的 `white-space` 没被设成 `nowrap`。

**怎么查**：

```bash
# 每个 truncate 都往上找一级，看有没有 minWidth="0"
grep -rn 'truncate' src --include=*.tsx

# CSS 里手写的截断三件套（应该换成 truncate）
grep -rn 'text-overflow: ellipsis' src --include=*.css
```

---

## 5. 想用更浅的灰 → `color` 给不到

**症状**：说明文字想用 `gray-10`、单位想用 `gray-9`，`Text color="gray"` 只给到 11 阶；想「跟随主题强调色」，`color` 没有这个选项。

**原因**：`Text` / `Heading` 的 `color` 只有两档映射——具名色 → `--{color}-a11`（alpha 版），加 `highContrast` → `--{color}-12`。**没有 9 / 10 阶，也没有「accent」这种跟随值**。

**改法**：

```tsx
// 11 阶、12 阶：走 prop
<Text color="gray">次要文字（gray-11）</Text>
<Text color="gray" highContrast>主要文字（gray-12）</Text>

// 10 阶、9 阶：只能 CSS，并写清原因
<Text size="1" className="stat-label">{label}</Text>
```
```css
/* Text color="gray" 只到 11 阶，这里要更弱的层级 */
.stat-label { color: var(--gray-10); }
```

**「跟随主题强调色」的正确写法**：写死具名色 + 一张映射表。

```tsx
// 改 accentColor 时要同步改这张表
const TONE_COLOR = { accent: 'indigo', success: 'green', danger: 'red' } as const
<Text color={TONE_COLOR[tone]}>{value}</Text>
```

**不要**为了「跟随 accent」去写 `color: var(--accent-11)`——那样当主题是 `green` 时，这个位置还是 indigo。要么用映射表，要么接受 CSS 里的 `var(--accent-11)`（后者确实跟随主题，但跳出了 `Text` 的 API）。

**一个观感事实**：`Text color="indigo"` 渲染的是 `--indigo-a11`（alpha 版），看起来比实色浅，会与背景混合。这是 Radix 的设计（彩色文字带透明度以适配背景），**不是 bug，不要覆盖**。

**怎么查**：

```bash
# 这些颜色声明是「Text color 够不到」的合法例外，但要能说出理由
grep -rnE 'color:\s*var\(--(gray|accent)-[0-9]+\)' src --include=*.css
```

---

## 6. 卡片和别的地方长得不一样

**症状**：面板一种圆角、设置卡片另一种圆角；换主题后某些卡片没变；同一视觉出现两套实现。

**原因**：手写卡片外观（`background` + `border` + `border-radius` + `box-shadow`），每处一套数字。

**改法**：卡片外观只有一处实现。

```tsx
<Card variant="surface">…</Card>
```

需要统一改描边 / 底色 / 内边距时，覆盖**变量**，不要重写声明：

```css
.card-flat {
  --base-card-padding-top: 0;      /* 内边距归零，各区块自己 p */
  --base-card-padding-right: 0;
  --base-card-padding-bottom: 0;
  --base-card-padding-left: 0;
  --base-card-surface-box-shadow: 0 0 0 1px var(--gray-a5);   /* 描边色 */
  --card-background-color: var(--gray-1);
}
```

**圆角不要在这里写**：`Card` 默认 `size="1"`（以及 `size="2"`）自己算出 `--radius-4`，跟着 `Theme` 的 `radius` 一起缩放。真要更大的圆角就传 `size`，别覆盖 `--base-card-border-radius`。

**预期差异**：`surface` 的描边是 `::after` 上的 inset ring，**不占布局**。从手写 `border` 换过来时，卡片会矮 1–2px、内容内缩少 1px。这是正常的。

**怎么查**：

```bash
# 手写卡片外观：同时出现 background + border + border-radius 的规则块
grep -rn 'border-radius' src --include=*.css | grep -v 'var(--radius'

# 两套卡片实现
grep -rn 'box-shadow' src --include=*.css
```

---

## 7. 改了主题，某些地方没跟着变

**症状**：把 `radius` 从 `medium` 改成 `large`，大部分地方变了，但有几处还是老样子；换 `accentColor` 后品牌色变了，某个高亮还是旧色。

**原因**：这些地方写死了像素或具体色名。

| 写死的形态 | 例子 | 应该 |
|---|---|---|
| 圆角像素 | `border-radius: 8px` | `var(--radius-4)` |
| 颜色 hex / rgb | `color: #3b5bdb` | `var(--accent-11)` |
| 具名色名（语义错位） | `color="indigo"` 是为「跟随主题」而写的 | 映射表 + 注释说明改 accent 要同步 |
| `accentColor` 写在后代 | `<Panel accentColor="blue">` | 删掉，从根继承 |
| `font-size` 像素 | `font-size: 13px` | 用 `size` |

**改法**：一切外观走令牌。三级圆角：容器 `radius-4`、区块 `radius-3`、控件 `radius-2`；圆形用 `50%`，胶囊用 `var(--radius-full)`。

**怎么查**：

```bash
# 写死的颜色
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src --include=*.css --include=*.tsx

# 写死的圆角（50% 是圆形、0 是直角，都不算写死）
grep -rn 'border-radius' src --include=*.css | grep -vE 'var\(--radius|50%|inherit|0;?$'

# 后代重复主题 prop
grep -rnE '(accentColor|radius|scaling|appearance)=' src --include=*.tsx | grep -v 'app.tsx'
```

---

## 8. 手搓了一个已有组件

**症状**：`<div className="settings-card">`、手写 `border + padding` 的标签、`overflow-y: auto` 的滚动容器、用 `Grid` 拼出来的表格。

**原因**：不知道 Radix 有这个能力，或者是旧代码遗留。

**改法**：先查 [components.md §1](components.md#1-先看清-api-形态) 的清单。

| 手搓的 | 换成 |
|---|---|
| 卡片容器 | `Card variant="surface"` |
| 状态标签 | `Badge variant="soft"` |
| 滚动列表 | `ScrollArea` |
| 数据表格 | `Table.*` |
| 分隔线 | `Separator` |
| 提示块 | `Callout.*` |
| 进度条 | `Progress` |
| 加载指示 | `Spinner` / `Skeleton` |

**确实该保留原生标签的情形**（写注释说明）：

- 路由库要求渲染成 `<a>`（如 React Router 的 `NavLink`，提供 `aria-current` 与客户端跳转）。
- `<label>` + 隐藏 `<input>` 的文件上传区——里面嵌 `<button>` 会形成嵌套可交互元素。
- `<details>` / `<summary>` 的原生折叠行为。

通用判据（「Themes 没提供的才用原生」）与 14 个构建块的清单见 [practices.md §2.7](practices.md#27-用-14-个构建块搭界面css-是例外)。

**评估换不换的一步**：先量尺寸档位。`Button` 只有 24 / 32 / 40 高，`Badge` 最小字号 12px。比这更小的控件硬换要写一堆覆盖，**算完不划算就保留现状并写清理由**——这不是偷懒，是把成本写在明处。

**怎么查**：

```bash
# 裸元素做布局或排版
grep -rnE '<(div|span|p|h[1-6])\b' src --include=*.tsx

# 原生滚动
grep -rnE 'overflow(-y|-x)?:\s*(auto|scroll)' src --include=*.css

# 内联样式（Radix 不接受 style 覆盖）
grep -rn 'style={{' src --include=*.tsx
```

---

## 9. 嵌套 Theme 后颜色更怪了

**症状**：在外层 `accentColor="green"` 里嵌一个 `accentColor="blue"`，灰阶还是偏绿；或者只想让一个按钮变色，结果整块区域都变了。

**原因**：嵌套 Theme 的 `grayColor` 默认继承父级**已经解析好**的灰阶，而不是 `'auto'`。所以改 accent 不会重算灰阶。

**改法**：

```tsx
// 想让灰阶跟着新 accent 走，必须显式 auto
<Theme accentColor="blue" grayColor="auto">…</Theme>

// 只想让一个组件变色，不要嵌套 Theme
<Button color="blue">…</Button>
```

**怎么查**：

```bash
grep -rn '<Theme' src --include=*.tsx
# 每处嵌套都问：为什么要嵌套？只在需要整块区域换强调色时才成立
```

---

## 10. 验证时数字对不上

**症状**：审计表里写 `padding: 34px 20px ✅`，实际是 `0px`；改完觉得「看起来一样」，上线后发现偏移。

**原因**：数字是从旧 CSS 抄的，不是从渲染读的。

**改法（三条硬规矩）**：

1. **所有验证数字必须来自 `getComputedStyle`**，不能抄 CSS。
2. **被测节点必须在 `.radix-themes` 子树内**。在 `<body>` 上测，`--space-*` 没有继承，`var()` 静默失效，量出来全是 0。
3. **删 CSS 之前先量原值**，删之后再量一次，两次对比。不是「应该一样」，是「确实是这个数」。

```js
// 在 DevTools Console 里
const el = document.querySelector('.my-panel');
const s = getComputedStyle(el);
console.log({
  padding: s.padding,
  gap: s.gap,
  fontSize: s.fontSize,
  lineHeight: s.lineHeight,
  borderRadius: s.borderRadius,
  color: s.color,
});
// 若全是 0 或空：确认 el.closest('.radix-themes') 不为 null
```

**怎么查**：验证表里每个数字都问一句「这个数是量出来的还是抄来的」。

---

## 11. 想要的 prop 在 Themes 页找不到，于是自己实现

**症状**：写了一个 `useEffect` 监听 `keydown` 处理 Esc 关闭；用 `pointer-events` 和 `z-index` 手搓弹层避让；用 CSS `:hover` 做本该延迟出现的提示；或者给有 `open` 概念的组件自己维护一个 `isOpen` state 再同步回去。

**原因**：Themes 组件的 prop 表**只列组件层新增的 prop**。Dialog、Select、Popover、DropdownMenu、Tooltip、ScrollArea 等 22 个组件会继承底层 primitive 的 prop，但继承来的那些在 Themes 页上不出现。于是「页面上没有」被读成「库不支持」，接着就是手写 JS 重实现——一个不报错、但绕过了库的 focus / 定位 / 无障碍逻辑的实现。

```tsx
// ❌ 页面没写 onEscapeKeyDown → 以为不支持
useEffect(() => {
  const onKey = (e) => e.key === 'Escape' && close()
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [close])

// ✅ 继承自 Dialog primitive 的 Content 部件
<Dialog.Content onEscapeKeyDown={(e) => confirmDiscard(e)} />
```

**改法**：动手实现之前，先查 [components.md §11](components.md#11-继承-prop-面) 的继承清单。下面三类**一定先查 prop**：

| 你想做的事 | 大概率已有 | 在哪 |
|---|---|---|
| Esc 关闭前确认 | `onEscapeKeyDown` | 所有弹层的 `Content` |
| 点外部关闭 | `onPointerDownOutside`、`onInteractOutside` | `Dialog` / `Popover` / `DropdownMenu` / `ContextMenu` / `HoverCard` 的 `Content`（`AlertDialog` 没有这两个） |
| 受控开关 | `open` / `defaultOpen` / `onOpenChange` | 弹层的 `Root` |
| 弹出位置与避让 | `side`、`sideOffset`、`align`、`avoidCollisions`、`collisionPadding` | `Tooltip` / `Popover` / `DropdownMenu` 的 `Content` |
| 滚动条策略与显示延迟 | `type`、`scrollHideDelay` | `ScrollArea` |
| 选中 / 输入状态 | `checked`、`onCheckedChange`、`value`、`onValueChange` | `Checkbox`、`Switch`、`Select.Root` |

**怎么查**：

```bash
# 启用了哪些 primitive 的继承（Types 里能看到）
grep -rln "Primitive" node_modules/@radix-ui/themes/dist --include=*.d.ts | head

# 是否有手写的事件/定位逻辑在顶替库行为
grep -rnE "addEventListener\('(keydown|pointerdown|mousedown)'|getBoundingClientRect\(\)" src --include=*.tsx
```

**判断口诀**：如果这段逻辑是在**重新实现一个 UI 交互的通用约定**（关闭、定位、焦点、延迟），先怀疑它已经在继承的 prop 面里。

---

## 12. `Tooltip` 悬浮在 `disabled` 元素上不出现

**症状**：给禁用的按钮或输入框加了 `<Tooltip content="未授权">`，鼠标悬浮或聚焦时 Tooltip 没有任何反应。

**原因**：原生浏览器规范中，处于 `disabled` 状态的 HTML 表单元素不会发射指针事件（pointer events），导致 `Tooltip` 无法接收到 `onPointerEnter` / `onFocus` 事件。

**改法**：在禁用元素外包裹一层能接收事件的非禁用容器（如 `span` 或 `Box`），并赋予 `tabIndex={0}` 以支持键盘聚焦：

```tsx
// ❌ 禁用按钮直接作为 Tooltip 唯一子节点：指针事件被吞
<Tooltip content="当前无权操作">
  <Button disabled>提交</Button>
</Tooltip>

// ✅ 外包非禁用容器承接指针与聚焦事件
<Tooltip content="当前无权操作">
  <Box asChild display="inline-block" tabIndex={0}>
    <span>
      <Button disabled style={{ pointerEvents: 'none' }}>提交</Button>
    </span>
  </Box>
</Tooltip>
```

**怎么查**：
```bash
# 检查 Tooltip 是否直接包了 disabled 控件
grep -rn -B 1 -A 2 'disabled' src --include=*.tsx | grep -B 2 'Tooltip'
```

---

## 13. `Select` 下拉菜单覆盖在按钮正上方

**症状**：点击 `Select.Trigger` 后，下拉菜单不是像常规 Web 控件那样在下方展开，而是正对着当前选中项直接盖在按钮上方，遮挡了触发器。

**原因**：`Select.Content` 的 `position` 默认值为 `"item-aligned"`（macOS/iOS 原生 Picker 习惯）。

**改法**：显式声明 `position="popper"`，并配合 `side="bottom"`：

```tsx
// ✅ 传统 Web 风格下拉
<Select.Root value={val} onValueChange={setVal}>
  <Select.Trigger />
  <Select.Content position="popper" side="bottom" sideOffset={4}>
    <Select.Item value="1">选项一</Select.Item>
  </Select.Content>
</Select.Root>
```

**怎么查**：
```bash
# 找出未配置 position="popper" 的 Select.Content
grep -rn '<Select.Content' src --include=*.tsx | grep -v 'position="popper"'
```

---

## 14. 按钮 hover 不是手型光标，手写类名覆盖

**症状**：项目要求所有按钮在 hover 时呈现手型（`pointer`），开发者编写了 `.my-button { cursor: pointer; }` 或覆盖 `.rt-Button`，导致控制台类名膨胀且禁用的 `not-allowed` 状态被暴力覆盖。

**原因**：Radix Themes 默认遵循现代操作系统桌面规范，所有按钮与复选框采用 `--cursor-button: default`。

**改法**：**不要写类名样式**，在全局根样式表（如 `src/renderer/index.css`）覆盖 Radix 令牌，既全局生效又保留 disabled 时的 `not-allowed`：

```css
/* ✅ 令牌层统一控制 */
:root {
  --cursor-button: pointer;
  --cursor-checkbox: pointer;
  --cursor-switch: pointer;
}
```

**怎么查**：
```bash
# 查找是否有针对按钮或自定义类硬写 cursor: pointer
grep -rnE '^\s*cursor:\s*pointer' src --include=*.css
```

---

## 15. 响应式断点写成 `base` 或 Tailwind 前缀导致失效

**症状**：写了响应式对象 `columns={{ base: '1', md: '3' }}` 或类名 `className="md:grid-cols-3"`，但在移动端没有任何样式，或者类型报错。

**原因**：Radix Themes 的断点 key 全集是 `initial`、`xs`、`sm`、`md`、`lg`、`xl`。移动端基线**必须是 `initial`**，不认识 Chakra 风格的 `base`，也不接 Tailwind 语法。

**改法**：
```tsx
// ❌ 错误
<Grid columns={{ base: '1', md: '3' }} className="sm:gap-2">

// ✅ 正确
<Grid columns={{ initial: '1', md: '3' }} gap={{ initial: '2', md: '4' }}>
```

**怎么查**：
```bash
# 检查是否混入了 base key
grep -rnE '\{\{[^}]*\bbase\s*:' src --include=*.tsx
```

---

## 16. 与预设组件对抗：写大段 CSS 暴力覆盖内部结构

**症状**：为了实现一个特殊视觉形态，给 `<Button>`、`<Badge>`、`<Card>` 挂了自定义 class，并在 CSS 里编写 `padding: ... !important; height: ...; border-style: dashed;` 等大段样式覆盖库自带外观。

**原因**：忽视了 Radix 官方推荐的样式分流哲学（*Beyond simple style overrides, use components as-is or create your own using building blocks*）。对高层成品组件做破坏性覆盖会破坏库内置的 Focus 环、Hover/Active 滤镜、无障碍反馈及特异性约束。

**改法**：
1. **As-Is**：若使用成品组件，全盘接受其预设尺寸与边框体系，只通过 `variant` / `size` / `color` 等 prop 调节。
2. **构建块自组**：若形态完全偏离，改用 14 个构建块（`Box` / `Flex` / `Grid` / `Text`）+ 令牌组装；需要交互时外包 `<Button asChild>`：

```tsx
// ❌ 错误：用 Button 强行改造成虚线上传卡片
<Button className="upload-dropzone">点击上传文件</Button>
/* CSS: .upload-dropzone { height: 120px !important; border: 2px dashed var(--gray-a6); padding: 0 !important; } */

// ✅ 正确：用构建块自组，外包 Button asChild 保持无障碍按键行为
<Button asChild variant="ghost" className="upload-dropzone-button">
  <Flex
    direction="column"
    align="center"
    justify="center"
    gap="2"
    p="6"
    className="upload-dropzone-box"
  >
    <UploadIcon />
    <Text size="2" weight="medium">点击或拖拽文件到此处上传</Text>
  </Flex>
</Button>
```

**怎么查**：
```bash
# 检查是否有针对 Radix 预设组件内部类名或挂点覆盖高度、内边距
grep -rnE '(\.rt-Button|\.rt-Card|\.rt-Badge)[^{]*\{[^}]*(padding|height|border-style)' src --include=*.css
```

---

## 17. 绕过 5 大布局容器，通过 CSS 类向非布局组件注入布局属性

**症状**：给 `<Text>`、`<Slider>`、`<Button>`、`<Badge>` 等非布局组件挂自定义 class，并在 CSS 里写 `min-width: 0; max-width: 100%;`、`flex: 1 1 0;`、`flex-shrink: 0;`、`width: ...;` 或 `align-self: flex-start;` 等布局属性。

**原因**：忽视了 Radix Themes 中**仅有 5 个基础布局组件**（`Box`、`Flex`、`Grid`、`Container`、`Section`）实现了 `LayoutProps`。叶子组件（`Text` 等）只有 `MarginProps`，本身并不承担几何尺寸与弹性。开发者为了图省事，不套 `Box` / `Flex`，而是手写自定义 CSS 类向叶子注入布局属性，破坏了「props 管布局，CSS 管外观」的单一真相原则。

**改法**：
使用 `<Box>` 或 `<Flex>` 显式包裹叶子组件，所有尺寸、弹性与几何边界一律由包裹容器的 props 控制：

```tsx
// ❌ 错误：在 CSS 里给 Text 注入 min-width/max-width 做收缩截断
<Text size="1" truncate className="copy-progress-path">{path}</Text>
/* CSS: .copy-progress-path { min-width: 0; max-width: 100%; } */

// ✅ 正确：外包 Box，props 表达几何边界与截断收缩
<Box minWidth="0" maxWidth="100%">
  <Text size="1" truncate>{path}</Text>
</Box>

// ❌ 错误：在 CSS 里为 Slider 或数值列手写 flex 弹性
.settings-row-slider .settings-row-control { flex: 1 1 0; }
.settings-row-value { flex-shrink: 0; min-width: 32px; text-align: right; }

// ✅ 正确：Slider 外层包 Box 传弹性 props，数值外层包固定尺寸 Box
<Box flexGrow="1" flexShrink="1" flexBasis="0" minWidth="0">
  <Slider value={[val]} />
</Box>
<Box flexShrink="0" minWidth="32px">
  <Text size="2" weight="medium" align="right" className="tabular">{val}</Text>
</Box>
```

**怎么查**：
```bash
# 检查 CSS 中是否向非布局类注入了尺寸与弹性属性
grep -rnE '^\s*(min-width|max-width|flex|flex-grow|flex-shrink|flex-basis|align-self)\s*:' src --include=*.css
```

---

## 17. 绕过 Typography color prop 在 CSS 中书写 11/12 阶文本颜色（CSS 颜色泄漏与双写）

**症状**：给 `Text` / `Heading` 加上自定义 class，只为了在 CSS 里声明 `color: var(--gray-12);` 或 `color: var(--gray-11);`。

**原因**：
1. **默认基准被无谓重写**：Radix Themes 中 `Text` / `Heading` 默认文本色由根主题直接下发（即 `--gray-12`），不需要任何类名或 prop。在 CSS 里写 `color: var(--gray-12)` 纯属冗余覆盖。
2. **忽视原生次级色 prop**：11 阶辅助色已有 `color="gray"`（精准映射 `--gray-a11` / `--gray-11`），绕过 prop 去自定义 CSS 类会导致双写（如果后续在 TSX 里改 `color="red"` 会被后加载的 CSS 静默吃掉）。
3. **制造 CSS 泄漏与死类名**：引入无业务语义的空壳类名（如 `.help-tip-title`、`.progress-label`），破坏了「字号是 size，颜色是 color，间距是 props」的单一真相原则。

**改法**：
彻底删掉纯为 11/12 阶文本颜色服务的 CSS 类，TSX 中直接使用原生 props 或开箱即用：

```tsx
// ❌ 错误：创建空壳类名只为写 11/12 阶颜色
<Text size="2" weight="bold" className="help-tip-title">{title}</Text>
<Text size="1" className="help-tip-text">{desc}</Text>
<Text size="1" weight="medium" className="progress-label">完成进度</Text>

// ✅ 正确：12 阶无需类名，11 阶用 color="gray"
<Text size="2" weight="bold">{title}</Text>
<Text size="1" color="gray">{desc}</Text>
<Text size="1" weight="medium" color="gray">完成进度</Text>
```

**怎么查**：
```bash
# 检查 CSS 中是否存在向文本类书写 gray-11 或 gray-12 声明
grep -rnE 'color:\s*var\(--gray-(11|12)\)' src --include=*.css
```

---

## 18. 误以为 Text 无等宽能力，在 CSS 声明 `font-family: var(--code-font-family)`

**症状**：为了让路径、哈希或机台代码等宽，在外部容器或自定义 CSS 类上声明 `font-family: var(--code-font-family);`，并试图由内部 `Text` 继承。

**原因**：
忽视了 9 大排版构建块中的 `<Code>` 与 `<Kbd>`。Radix Themes 将等宽字体（`var(--code-font-family)`）直接绑定在 `<Code>` / `<Kbd>` 组件上，而不是给 `Text` 增加 `fontFamily` prop。手写 CSS 属于典型的「跨过已有排版构建块去手搓」。

**改法**：
- 纯文本等宽（无背景描边）：使用 `<Code size="1" variant="ghost">`。
- 徽标/标签式等宽：使用 `<Code size="1" variant="soft">`。
- 彻底删掉 CSS 里的 `font-family: var(--code-font-family);`。

```tsx
// ❌ 错误：在 CSS 注入等宽字体
<Flex className="path-strip"><Text size="1" color="gray">{path}</Text></Flex>
/* CSS: .path-strip { font-family: var(--code-font-family); } */

// ✅ 正确：直接使用 Code 构建块
<Flex className="path-strip">
  <Code size="1" variant="ghost" color="gray" truncate>{path}</Code>
</Flex>
```

**怎么查**：
```bash
grep -rnE 'font-family:\s*var\(--code-font-family\)' src --include=*.css
```

---

## 19. 绕过 align prop 在 CSS 中手写 `text-align`

**症状**：在 CSS 里写 `text-align: center;` 或 `text-align: right;` 来控制文本居中或对齐。

**原因**：
排版组件（`Text` / `Heading`）自带 `align="left" | "center" | "right"` prop。在 CSS 自定义类中写 `text-align` 会形成双写并破坏单一真相来源。

**改法**：
删掉 CSS 里的 `text-align`，在 JSX 中直接为 `Text` 传递 `align` prop：

```tsx
// ❌ 错误：在 CSS 自定义类写 text-align
.empty-state { text-align: center; }

// ✅ 正确：由 Text 自身的 align prop 表达
<Text size="2" weight="medium" align="center">{title}</Text>
```

**怎么查**：
```bash
grep -rnE 'text-align:\s*(center|right|left)' src --include=*.css
```

---

## 20. 忽视 ScrollArea 原生 size prop，手写 `::-webkit-scrollbar` 定制滚动条

**症状**：在 CSS 中编写 `::-webkit-scrollbar`、`::-webkit-scrollbar-thumb` 去控制全局或局部容器的滚动条宽度与颜色。

**原因**：
误以为 Radix Themes 无法调节滚动条样式。实际上 Radix 的 `<ScrollArea>` 基于 `@radix-ui/react-scroll-area` 实现了跨平台的虚拟滚动条：
- 滚动条宽度与滑块粗细原生由 `size` prop 控制（`size="1"` 为 4px/3px 紧凑型，`size="2"` 为 8px/6px 标准型，`size="3"` 为 12px/10px 宽松型）；
- 滑块底色与 hover 态完全由主题系统与令牌驱动（自动适配明暗模式与主题色联动）；
- 伪类 `::-webkit-scrollbar` 仅对 WebKit 原生滚动条生效，破坏了组件库的一致性与高对比度无障碍支持。

**改法**：
彻底删除 CSS 里的 `::-webkit-scrollbar` 声明，需要滚动的区域统一使用 `<ScrollArea>`，并传入 `size` prop：

```tsx
// ❌ 错误：手写 WebKit 滚动条样式
.app-shell ::-webkit-scrollbar { width: 10px; }
.app-shell ::-webkit-scrollbar-thumb { background: var(--gray-a4); }

// ✅ 正确：局部列表传 size="1"，主页面传 size="2"
<ScrollArea type="auto" size="1" scrollbars="vertical">
  {items}
</ScrollArea>
```

**怎么查**：
```bash
grep -rnE '::-webkit-scrollbar' src --include=*.css
```

---

## 附：一页速查

| 现象 | 最可能的原因 | 一句话改法 |
|---|---|---|
| prop 不生效 | 双写，CSS 后加载 | 同名属性只留一处 |
| padding 是 0 | `p="2 4"` | 拆 `py` / `px` |
| 字号怪 | CSS 写了 `font-size` | 删掉，用 `size` |
| 截断失效 | 中间层没有 `minWidth="0"` | 链路每层都能收缩 |
| 颜色给不到 | `color` 只到 11 / 12 阶 | 9/10 阶留 CSS 并写理由 |
| 卡片不一致 | 手写外观 | `Card variant="surface"` |
| 主题改了没反应 | 写死像素 / hex | 换令牌 |
| 又手搓了一个组件 | 不知道已有能力 | 查组件清单 |
| 嵌套后灰阶不对 | 继承已解析灰阶 | 显式 `grayColor="auto"` |
| 数字对不上 | 抄的旧 CSS | 用 `getComputedStyle` 量 |
| 又手写了一层交互 | 继承 prop 面没查 | 看 [components.md §11](components.md#11-继承-prop-面) |
| Tooltip 在禁用按钮上失效 | 禁用元素无指针事件 | 外包一层带有 tabIndex 的 span/Box |
| Select 盖在按钮正上方 | 默认 item-aligned | 加 `position="popper"` |
| 按钮 hover 箭头想要手型 | 默认遵循桌面规范 | 覆盖变量 `--cursor-button: pointer;` |
| 响应式断点无效或报错 | 写了 base 或 Tailwind 类 | 统一用 `initial` 与六档标准断点 |
| 暴力覆盖组件内边距与高度 | 违背 As-Is 原则 | 要么 as-is，要么用构建块自组 |
| 非布局组件在 CSS 里写宽高弹性 | 绕过 5 大布局容器 | 外层包 `<Box>` / `<Flex>` 并由 props 控制 |
| 文本颜色手写 CSS 类 | 绕过 Typography color prop | 12 阶删掉 CSS，11 阶改用 `color="gray"` |
| 文本想等宽却在 CSS 写字体 | 忽视 Code 排版构建块 | 换用 `<Code variant="ghost">`，删 CSS 字体 |
| 文本对齐手写 CSS | 绕过 Typography align prop | 删掉 CSS，改用 `<Text align="center">` |
| 滚动条手写 CSS 定制 | 忽视 ScrollArea size prop | 删掉 `::-webkit-scrollbar`，改用 `<ScrollArea size="1" \| "2">` |
