# 主题定制与设计令牌

`<Theme>` 是全应用设计令牌的发生器与分发器（基准 `@radix-ui/themes@3.3+`）。本文件提供官方文档未直接列出计算结果的**像素表、继承细节与源码差异**。

## 目录

1. [Theme 的全部开关](#1-theme-的全部开关)
2. [根节点只写偏离默认值的 prop](#2-根节点只写偏离默认值的-prop)
3. [radius：六档到底是多少像素](#3-radius六档到底是多少像素)
4. [scaling 与六档断点体系](#4-scaling-与六档断点体系)
5. [accentColor 与 grayColor 的联动](#5-accentcolor-与-graycolor-的联动)
6. [嵌套 Theme 的三条注意](#6-嵌套-theme-的三条注意)
7. [面板背景：panelBackground 的真实作用面](#7-面板背景panelbackground-的真实作用面)
8. [令牌速查与 12 阶色阶分工](#8-令牌速查与-12-阶色阶分工)
9. [不要重写主题已经分发的值](#9-不要重写主题已经分发的值)

---

## 1. Theme 的全部开关

| Prop | 源码默认值 | 可选值 | 作用范围 |
| --- | --- | --- | --- |
| `appearance` | `'inherit'` | `'light'` / `'dark'` / `'inherit'` | 切换整套明暗令牌；文档写默认 `light`，源码实际为 `inherit`（仅做浅色的应用需显式传 `'light'`） |
| `accentColor` | `'indigo'` | 26 个具名色 | 下发 `--accent-1`~`12`、`--accent-a1`~`a12`、`--focus-8` |
| `grayColor` | `'auto'` | `'auto'` + 6 个灰阶（`gray`/`mauve`/`slate`/`sage`/`olive`/`sand`） | 下发 `--gray-1`~`12`、`--gray-a1`~`a12` |
| `radius` | `'medium'` | `'none'` / `'small'` / `'medium'` / `'large'` / `'full'` | 派生 `--radius-1`~`6` 与 `--radius-full` |
| `scaling` | `'100%'` | `'90%'` / `'95%'` / `'100%'` / `'105%'` / `'110%'` | 缩放间距、字号、行高、圆角（最高仅 `110%`） |
| `panelBackground` | `'translucent'` | `'solid'` / `'translucent'` | 控制 `--color-panel`（仅 `Card` 与 `Table` 消费） |
| `hasBackground` | `true`（根或显式传 `appearance` 时） | `boolean` | 是否在当前 `.radix-themes` 节点铺画布底色 |
| `asChild` | `false` | `boolean` | 复用子元素宿主，不额外包 `<div class="radix-themes">` |

`<ThemePanel />` 仅用于开发期交互调参，上线前移除。

---

## 2. 根节点只写偏离默认值的 prop

```tsx
// ✅ 只写偏离项：固定浅色 + 钉死 slate 冷灰（防止将来改 accentColor 时灰阶跟着漂移）
<Theme appearance="light" grayColor="slate">
  <App />
</Theme>
```

后代组件自动通过 CSS 变量级联消费根主题，不在业务组件里重复传 `radius="medium"` 或 `accentColor`。全站替换字体只需同时在 `:root` 与 `.radix-themes` 覆盖 `--default-font-family` / `--heading-font-family` / `--code-font-family`。

---

## 3. radius：六档到底是多少像素

`scaling="100%"` 下各 `radius` 档位派生的像素值：

| `radius` | factor | `--radius-1` | `--radius-2` | `--radius-3` | `--radius-4` | `--radius-5` | `--radius-6` | `--radius-full` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `none` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0px |
| `small` | 0.75 | 2.25px | 3px | 4.5px | 6px | 9px | 12px | 0px |
| `medium`（默认） | 1 | 3px | 4px | 6px | 8px | 12px | 16px | 0px |
| `large` | 1.5 | 4.5px | 6px | 9px | 12px | 18px | 24px | 0px |
| `full` | 1.5 | 4.5px | 6px | 9px | 12px | 18px | 24px | **9999px** |

- `radius="full"` 的 factor 与 `large` 相同，仅把 `--radius-full` 置为 `9999px`（让原本采用 `max(var(--radius-N), var(--radius-full))` 的 `Button`、`Badge`、`TextField` 变为胶囊，而卡片保持 `large` 圆角）。
- 自定义容器圆角按层级引用令牌：大容器/面板 `var(--radius-4)`、内部区块 `var(--radius-3)`、小控件 `var(--radius-2)`、胶囊 `var(--radius-full)`、正圆 `50%`。

---

## 4. scaling 与六档断点体系

- **受 `scaling` 乘数缩放**：`--space-1`~`9`、`--font-size-1`~`9`、`--line-height-1`~`9`、`--heading-line-height-1`~`9`、`--radius-1`~`6` 及复选框/表格行高等内部尺寸。
- **不受 `scaling` 缩放**：`1px` 边框宽度、`--shadow-1`~`6`、`--container-1`~`4`（448 / 688 / 880 / 1136px）与响应式断点宽度。

### 4.1 Breakpoints 六档断点体系

| 断点键名 | 最小视口宽度 | 说明 |
| --- | --- | --- |
| `initial` | `0px` | 默认基线（响应式对象必填，不写 `base`） |
| `xs` | `520px` | 大屏手机 / 紧凑浮窗 |
| `sm` | `768px` | 平板竖屏 |
| `md` | `1024px` | 紧凑笔记本 |
| `lg` | `1280px` | 标准桌面显示器 |
| `xl` | `1640px` | 宽屏桌面 |

### 4.2 Cursors 光标令牌

Radix Themes 默认遵循桌面原生规范（`--cursor-button: default`，仅 `--cursor-link: pointer`、`--cursor-disabled: not-allowed`）。若产品需要 Web 手型按钮，统一在全局根样式表 `:root` 覆盖令牌，既全站生效又保留禁用态 `not-allowed`：

```css
:root {
  --cursor-button: pointer;
  --cursor-checkbox: pointer;
  --cursor-radio: pointer;
  --cursor-switch: pointer;
  --cursor-menu-item: pointer;
}
```

---

## 5. accentColor 与 grayColor 的联动

`grayColor="auto"` 按 `accentColor` 自动映射互补灰阶：

| `accentColor` | 自动解析的 `grayColor` |
| --- | --- |
| `tomato` / `red` / `ruby` / `crimson` / `pink` / `plum` / `purple` / `violet` | `mauve` |
| `iris` / `indigo` / `blue` / `sky` / `cyan` | `slate` |
| `teal` / `jade` / `mint` / `green` | `sage` |
| `grass` / `lime` | `olive` |
| `yellow` / `amber` / `orange` / `brown` / `gold` / `bronze` | `sand` |
| `gray` | `gray` |

固定品牌中性灰时显式设置 `grayColor="slate"`（或其他具体灰阶），避免切换强调色时全站灰底与边框跟着变冷暖。

---

## 6. 嵌套 Theme 的三条注意

1. **内层默认继承父级「已解析」的灰阶**：外层 `accentColor="green"`（解析为 `sage`）内嵌 `<Theme accentColor="blue">` 时，灰阶仍保持 `sage`；需重算互补灰时显式传 `grayColor="auto"`。
2. **减少多余包装层**：局部换主题时配 `asChild`（如 `<Theme accentColor="crimson" asChild><section>…</section></Theme>`）。
3. **单个控件换色直接传组件 `color` prop**，不为单个按钮包一层 `<Theme>`。

---

## 7. 面板背景：`panelBackground` 的真实作用面

`panelBackground` 仅切换 `--color-panel`（实色 vs 带 `backdrop-filter` 半透明），源码中只有 `Card` 与 `Table` 读取它。`Popover`、`HoverCard`、`Select` 固定读取 `--color-panel-solid`，若有定制需求需直接覆盖对应 CSS 变量。

---

## 8. 令牌速查与 12 阶色阶分工

| 阶位 | 官方设计用途 |
| --- | --- |
| `1`–`2` | 画布底色 / 卡片表面底色 |
| `3`–`5` | 交互控件底色（默认 `3` / hover `4` / active `5`） |
| `6`–`8` | 边框与分隔线（弱分隔 `6` / 控件描边 `7` / 焦点与强描边 `8`，焦点环专用 `--focus-8`） |
| `9`–`10` | 实心强调背景（solid 按钮 `9` / hover `10`）及非文本装饰图标/状态点 |
| `11` | 次级可访问阅读文本（`<Text color="gray">` 或具名色 `--{color}-a11`） |
| `12` | 主要高对比阅读文本（正文、标题默认继承 `--gray-12`） |

---

## 9. 不要重写主题已经分发的值

删掉某条 CSS 后若 `getComputedStyle` 完全一致即为冗余（例如在 `.rt-Text` 上写 `margin: 0` 或 `color: var(--gray-12)`）。

### focus 环

Radix 各控件已在恰当层级使用 `--focus-8` 绘制焦点环（如 `TextField` 在外层 `:focus-within` 上）。切勿编写通配 `:focus-visible` 规则以免叠出双层环；仅为原生可聚焦宿主（路由 `<a>`、文件 `<label>`、`<summary>`）补充收窄焦点样式：

```css
.app-shell :is(a, label, summary):focus-visible {
  outline: 2px solid var(--focus-8);
  outline-offset: 2px;
}
```
