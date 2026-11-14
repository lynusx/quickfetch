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
- CSS 只留 props 表达不了的：`:hover`、`[data-state]`、`border`、`background`、`font-family`、`grid-template-columns`、`max-width` 的响应式组合。

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

**圆角不要在这里写**：`Card` 默认 `size="2"` 自己算出 `--radius-4`，跟着 `Theme` 的 `radius` 一起缩放。真要更大的圆角就传 `size`，别覆盖 `--base-card-border-radius`。

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
