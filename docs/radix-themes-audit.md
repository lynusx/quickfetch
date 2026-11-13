# Radix Themes 使用审计

> 审计对象：`next` 分支（起点 `1ded68c`）。范围：`src/renderer/` 全部 UI 代码。
> 结论：**组件利用率高，问题集中在「props 与 CSS 双写」与少数重造组件**。
> 本文档同时记录已修项与待办项，后续改动按末尾优先级推进。
>
> **规则位置**：各章里说的「`AGENTS.md` 原则 3 新增／改写」是当时的动作记录。从第 14 章起，
> 规则全文已迁到 [`.claude/skills/radix-themes/references/rules.md`](../.claude/skills/radix-themes/references/rules.md)，
> `AGENTS.md` 只保留原则与指针。查现行规则请去 skill，不要按本文的历史描述去找。

---

## 0. 摘要

| 维度       | 现状                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 组件库纪律 | 全部 UI 来自 `@radix-ui/themes`；无 shadcn/ui、MUI、Tailwind、styled-components、emotion                                                                                      |
| 颜色令牌   | 全仓库无 hex 颜色，全部 `var(--gray-*)` / `var(--accent-*)`                                                                                                                   |
| 内联样式   | 无 `style={{ }}`（`Panel` 那个未使用的透传 `style` prop 已随重构删除）                                                                                                        |
| 卡片外观   | 只有一处实现：`Card variant="surface"` + `.app-card`；面板与设置卡共用                                                                                                        |
| CSS 规模   | 21 个文件、1292 行（审计前 22 个文件、1735 行，净删 443 行）                                                                                                                  |
| 代码改动   | 累计 51 个文件，+796 / −855（含本轮新增的 `.stylelintrc.mjs`、`docs/`、`anti-patterns.md`）                                                                                   |
| 机器约束   | `stylelint` 拦 `font-size` / `letter-spacing`，已接入 `pnpm lint`，首跑零违规                                                                                                 |
| 主要问题   | props 与 className 双写同一属性；3 处裸元素；2 处重造组件；侧边栏原生滚动；60+ 处未对齐尺度档位；**字号、行高、字距绕过 `size` 手写**；**文字挂在布局组件上、颜色压在容器上** |

**为什么会漂移**：`AGENTS.md` 原则 3 与 `SKILL.md` 红线已经写清楚规则，但规则是抽象陈述，
没有真实反模式对照、没有改动前自查清单、红线没点名高频误造组件，因此每次改动都从零推断。
本次一并补齐（见第 8 章）。

---

## 1. 双写：props 与 CSS 各写一遍（P1，已修）

项目 CSS 在 Radix 之后加载，`.rt-r-*` 与自定义 class 同级、后加载者胜。因此
「props 写一遍、CSS 再写一遍」不是冗余，而是**静默让 prop 失效**。

| 位置                                                                     | 双写内容                                                                                                                                                             | 处理                                                                                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `components/field/field.tsx` ↔ `field.css`                               | `.field` 的 `display/flex-direction/gap`、`.field-head` 的 `align/justify/gap/min-height`、`.field-label`、`.field-actions`、`.step`、`.step-index`、`.step-content` | CSS 侧全部删除，值迁到 props（`gap="7px"`、`minHeight="22px"`、`flexGrow="1"`）                                 |
| `components/empty-state/empty-state.tsx` ↔ `empty-state.css`             | `.empty-state` 的 flex 全套 + `padding`、`.empty-icon` 的尺寸与 `margin-bottom`、`.empty-action` 的 `margin-top`                                                     | 同上；`text-align: center` 留 CSS（无 prop）                                                                    |
| `components/stat/stat.tsx` ↔ `stat.css`                                  | `.stat-grid` 的 `display/gap`、`.stat` 的 `min-width/padding`                                                                                                        | 删 CSS，`grid-template-columns` + 响应式留 CSS                                                                  |
| `components/choice-list/choice-list.tsx` ↔ `choice-list.css`             | `.choice-grid`、`.choice-cell`、`.machine-label`                                                                                                                     | 见下条「静默冲突」                                                                                              |
| `components/panel/panel.tsx` ↔ `panel.css`                               | `.panel-header`、`.panel-header-main`、`.panel-title-row`、`.panel-icon`、`.panel-actions`、`.panel-body`                                                            | 全部迁 props，同时压平一层嵌套                                                                                  |
| `features/scan/components/scan-task-panel.tsx` ↔ `scan.css`              | `.progress-head`、`.progress-meta`、`.path-strip`、`.action-bar`、`.inline-hint`、`.callout-stack`、`.panel-section`、`.panel-section-title`                         | 迁 props；`.progress-meta` 的 `gap: 4px 14px` 是行列异距，props 无法表达，保留 CSS 并删掉 tsx 里的 `wrap`/`gap` |
| `features/scan/components/plant-scan-page.tsx` ↔ `scan.css`              | `.panel-stack`、`.panel-section`、`.workbench-grid`                                                                                                                  | 迁 `gap="18px"`、`minWidth="0"`、`mt/pt` 到 props                                                               |
| `features/copy/copy-progress.tsx` ↔ `copy-progress.css`                  | `.copy-progress`、`.copy-canceled`、`.copy-progress-head`、`.copy-progress-meta`                                                                                     | 迁 props                                                                                                        |
| `features/copy/copy-panel.tsx` ↔ `copy.css`                              | `.target-dir`、`.machine-grid`、`.machine-item`、`.field-row`、`.action-bar`                                                                                         | 迁 props；`.field-row`/`.action-bar` 规则整体删除                                                               |
| `features/history/history-panel.tsx` ↔ `history.css`                     | `.history-toolbar`、`.history-row`、`.history-main`、`.history-time`                                                                                                 | 迁 props；`.history-toolbar-hint` 的 `flex:1/min-width:0` 保留（`Text` 无 flex props）                          |
| `features/settings/components/settings-group.tsx` ↔ `settings-group.css` | `.settings-card-footer`                                                                                                                                              | 迁 props，CSS 只留 `border-top`                                                                                 |
| `layouts/app-sidebar.tsx` ↔ `app-sidebar.css`                            | `.app-sidebar`、`.sidebar-brand`、`.sidebar-nav`、`.sidebar-meta`、`.sidebar-status`、`.nav-icon`                                                                    | 迁 props；`.sidebar-scroll` 的 `flex:1/min-height:0` 保留（`ScrollArea` 不转发）                                |
| `layouts/app-layout.tsx` ↔ `app-layout.css`                              | `.app-shell`、`.app-topbar`、`.app-body`、`.app-main`、`.app-content` 的 flex 尺寸与 margin                                                                          | 外壳四层全改 props-first，CSS 只剩背景/边框/阴影与 `-webkit-app-region`                                         |
| `index.css`                                                              | `.workbench-grid` 的 `display/gap/align-items`、`.action-bar`、`.action-bar-spacer`                                                                                  | 迁 props，后两条规则整体删除（`action-bar-spacer` 无人使用）                                                    |

### 1.1 一处真实 bug：`choice-list` 的 gap 被 CSS 吃掉

```tsx
// 修复前
<Grid className="choice-grid" gap="2">   // 8px，从未生效
.choice-grid { display: grid; gap: 6px; } // 6px 实际生效
```

**处理**：按「保持视觉不变」原则，props 写回 CSS 实际生效值 `gap="6px"`，CSS 删除 `display/gap`。
这不是例外，而是教训——如果当时有人把 6px 调成 10px，会以为改的是 prop。

---

## 2. 裸元素承载布局（P1，已修）

`AGENTS.md` 原则 3 明确禁止用裸 `div`/`span`/`p`/`h1`–`h6` 做布局或排版。审计发现 3 处：

| 位置                                              | 修复前                                                                     | 修复后                                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `features/settings/components/settings-group.tsx` | `<section className="settings-group">` + `<div className="settings-card">` | `<Box className="settings-group">` + `<Box className="settings-card">`                      |
| `features/update/update-settings-section.tsx`     | `<div className="settings-card-footer update-state">`                      | `<Flex className="settings-card-footer" direction="column" gap="10px" px="16px" py="14px">` |

**局限**：`Box` 的 `as` 只接受 `"div" | "span"`，`as="section"` 会报类型错，所以语义化 `section`
要么用 `Section` 组件（自带垂直 padding，需额外清零），要么放弃。本次选择放弃语义标签保布局。

**允许保留的裸元素**（语义必需，已在文档中白名单）：`history-panel.tsx` 的 `<button>` 摘要行、
`excel-upload-zone.tsx` 的 `<label>/<input>`、`plant-machine-picker.tsx` 的 `<details>/<summary>`。

---

## 3. 重造 Radix 已有组件（P2）

### 3.1 Panel / settings-card → Card（已修）

改造前是两套手写的卡片外观，参数还不一致：

|                  | 圆角                             | 描边 / 阴影                                         | 内边距                                       |
| ---------------- | -------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| `.panel`         | `var(--app-radius-panel)` = 14px | `1px solid var(--app-border)` + `0 1px 2px gray-a3` | header `18px 20px 0` + body `16px 20px 20px` |
| `.settings-card` | 10px                             | 同上，阴影换 `gray-a2`                              | 由行内 `p` 承担                              |

现在两者都是 `Card variant="surface"`，共用一个 `.app-card` 工具类：

```tsx
// components/panel/panel.tsx
<Card variant="surface" className={cn('app-card', 'panel', className)}>

// features/settings/components/settings-group.tsx
<Card variant="surface" className="app-card settings-card">
```

`.app-card` 放在 `index.css` 的共享工具类区，负责 Card 没有暴露成 prop 的部分：

| 需要覆盖的东西 | 变量                             | 原因                                         |
| -------------- | -------------------------------- | -------------------------------------------- |
| 内边距归零     | `--base-card-padding-*`          | Card 的 padding 只由 `size` 决定，无 prop    |
| 圆角           | `--base-card-border-radius`      | Card 的圆角同样只跟 `size` 走                |
| 描边色         | `--base-card-surface-box-shadow` | surface 变体的描边是 inset ring，不是 border |
| 背景色         | `--card-background-color`        | 默认取 `--color-panel`（半透明面板色）       |
| 外投影         | 元素自身 `box-shadow`            | surface 变体不带外投影                       |

使用方只声明 `--app-card-radius` / `--app-card-shadow` 两个值，`.panel` 与 `.settings-card`
各写两行。**没有统一圆角**：面板 14px、设置卡 10px 是现状观感，本轮以像素一致优先，留待设计决策。

**实测差异**（CDP 读计算样式，改造前后逐项比对）：卡片高度 −2px、内容整体内缩 1px。
原因只有一个——Card 的描边是 inset ring，不再像 `border` 那样占布局。其余
`padding`/`gap`/`font-*`/`border-radius`(14px)/`box-shadow` 全部一致。

### 3.2 `.share-badge` → Badge（已修）

改造前是三种状态各写一条色值规则，颜色与背景都手写：

```tsx
// 改造前
<Box as="span" className="share-badge" data-tone={badge.tone}>{badge.label}</Box>
// 改造后
<Badge className="share-badge" variant="soft" color={SHARE_TONE_COLOR[badge.tone]} data-tone={badge.tone}>
```

状态色交给 Badge 的 `color`：`gray` / 主题强调色（不写死 indigo）/ `red`；`flex-shrink`、
`nowrap`、`font-weight`、圆角都由 Badge 自带。CSS 只留三行度量（9.5px / 1.5 / 1px 5px）——
Badge 最小档位是 12px / 2px 6px，比本页密集排版大一档；另有一条把「未探测」压回 `gray-9`
的规则（Badge 的 gray-soft 用 `gray-11`，对「未探测」太显眼）。

**实测**：高度 16.25px、圆角 3px、三种状态的实际渲染色（alpha 叠加后）全部与改造前相同；
宽度差 <1px（Badge size 1 带 `0.0025em` 字距）。

### 3.3 `.upload-cta` → Button（评估后不做）

`features/excel/excel.css` 手写了一个 outline 按钮外观，审计时判为「重造 Button」。
真正动手时发现不成立，理由如下：

| 维度     | 现状                     | `Button size="1"`    | 差距                          |
| -------- | ------------------------ | -------------------- | ----------------------------- |
| 高度     | 30px                     | 24px（`--space-5`）  | 要覆盖 `--base-button-height` |
| 圆角     | 4px                      | 3px（`radius-1`）    | 要覆盖 `border-radius`        |
| 横向内距 | 12px                     | 8px（`--space-2`）   | 要覆盖 `padding-inline`       |
| hover    | 描边转强调色、文字转强调 | 背景转 `--accent-a2` | 要覆盖 `box-shadow` + `color` |

也就是要写 5~6 处覆盖才能还原，反而比现在 10 行声明更难读；而且它是 `<label>` 里的
**视觉提示**而不是独立控件，塞一个 `<button>` 进去会变成嵌套可交互元素，键盘与读屏语义都更差。

**结论**：保留现状。等控件整体升到 `size="2"`（高度 32px、圆角 4px）时，这里可以一行换掉。

### 3.4 `.data-list` / `.data-row` ≈ Table（可选，未做）

`scan.css` 用 `Grid` + `grid-template-columns: minmax(96px,150px) 1fr 76px` 手搓三列表格，
`sheet-table-preview.tsx` 的 `Table.Root` 是正例。当前依赖 `data-state` 给状态行上色、
`hover` 背景与 `border-bottom` 收边，迁 `Table` 需要重做这些状态样式，收益中等。

---

## 4. 自定义滚动未用 ScrollArea（P2，已修）

只有侧边栏用原生滚动，其余（page-shell、choice-list、copy、history）早已统一：

```tsx
// 修复前：.sidebar-nav { flex:1; min-height:0; overflow-y:auto; }
// 修复后
<ScrollArea
  className="sidebar-scroll"
  type="auto"
  scrollbars="vertical"
  role="navigation"
>
  <Box px="12px" pt="6px" pb="16px">
    …
  </Box>
</ScrollArea>
```

**踩到的限制**：`ScrollArea` 只接受 `type`/`scrollbars`/`radius`，不转发 `flexGrow`/`minHeight`/
`padding`。于是 padding 给内层 `Box`，弹性留在 `.sidebar-scroll` 并注释原因。
这个限制已写进 `AGENTS.md`，避免下次有人以为可以传 props。

**合规例外**：`help-tip.css` 的 `Popover.Content { overflow-y: auto }`——Popover 无 overflow prop，代码里有注释。

---

## 5. 显式写默认值（P3，已修 18 处）

`Button` 与 `Text` 的 `size` 默认值就是 `"2"`，写了不产生任何效果。已删除 18 处：

`copy-panel.tsx`(6)、`scan-task-panel.tsx`(4)、`update-settings-section.tsx`(4)、
`settings-page.tsx`(2)、`date-picker.tsx`(1)、`excel-viewer.tsx`(1)。

**刻意保留**：`Text size="2"` 在被 CSS 覆盖 `font-size` 的地方不删——它还负责注入
`--line-height` / `--letter-spacing`（`choice-list.tsx` 的 `.choice-label`、`settings-row-label`）。
`Progress`/`Spinner`/`Badge` 的 `size` 默认值各不相同（Badge 默认 1），不要批量删。

---

## 6. 多余嵌套与空规则（P3，已修）

- `panel.tsx`：`Flex(panel-header) > Box(panel-header-main) > Flex(panel-title-row) > Flex(panel-icon)`
  四层渲染标题行。压平成 `Flex > Flex(column) > Flex(icon)`，`min-width:0` 改走 props。
- `update.css`：`.update-state` / `.update-actions` 在迁移后已无引用，文件整体清空
  → 连文件与 `import './update.css'` 一并删除（避免空 CSS 文件）。
- `scan.css`：`.progress-head`、`.callout-stack`、`.action-bar`、`.action-bar-spacer` 整条规则删除。

---

## 7. 留存的 CSS 与理由（不是遗漏）

| 位置                                                                    | 留存内容                                                 | 理由                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| 全部组件                                                                | `font-size` / `line-height` / `letter-spacing` / `color` | props 无法表达字号；值已全部换成 `var(--font-size-N)` 等令牌，见第 10 章 |
| `*.css` 的 `:hover` / `[data-state]` / `[aria-current]` / `:last-child` | 交互态                                                   | 伪类只能 CSS                                                             |
| `index.css` 的 `.status-dot`、`.workbench-grid` 列模板                  | 无等价组件 / 需 1180px 非标准断点                        | Radix 断点是 520/768/1024/1280/1640                                      |
| `app-sidebar.css` `.nav-item` / `.nav-group-label`                      | `NavLink` 是原生 `<a>`、`Text` 只有 margin props         | 组件不转发布局 props                                                     |
| `app-sidebar.css` `.sidebar-scroll`                                     | `flex:1` / `min-height:0`                                | ScrollArea 不转发 flex                                                   |
| `settings.css` `.settings-segmented .rt-SegmentedControlItemLabel`      | `.rt-*` 内部类覆盖                                       | 官方允许的深度定制                                                       |
| `date-picker.css`                                                       | `--rdp-*` 令牌覆盖                                       | Themes 缺失组件的标准补法                                                |

---

## 8. 防偏移加固（已落地）

根因：规则存在但不可执行。三项加固已写入仓库：

1. **`AGENTS.md` 原则 3** 新增两个真实反模式对照（choice-list 的 gap 静默冲突、field 的整块双写）、
   「不转发布局 props 的组件」说明、以及指向案例库的入口。
2. **`.claude/skills/radix-themes/SKILL.md`** 红线 6 点名高频误造组件（Card / Badge / ScrollArea /
   Table / Separator）；新增「改已有 UI 代码前的自查清单」六条。
3. **`.claude/skills/radix-themes/references/anti-patterns.md`**（新建）按现象收录全部案例：
   双写、重造组件、裸元素、原生滚动、默认值、多余嵌套，每条给出前/后代码与验证方式。

**未做（可后续升级）**：静态检查硬拦截。目前只有文档约束，双写仍靠 review 发现。
可行路径：stylelint 规则禁止项目 CSS 出现 `display`/`flex-direction`/`gap`/`padding`（白名单除外），
在 `pnpm lint` 阶段拦截；或写一个 eslint 规则比对同组件 tsx props 与 CSS 声明。

---

## 9. 优先级汇总

| 优先级 | 项                                     | 状态                            |
| ------ | -------------------------------------- | ------------------------------- |
| P1     | 13 个文件的 props↔CSS 双写收敛         | ✅ 已修                         |
| P1     | `choice-list` 的 gap 静默冲突          | ✅ 已修（保持 6px 视觉）        |
| P1     | 2 个文件的 3 处裸元素                  | ✅ 已修                         |
| P2     | 侧边栏原生滚动 → ScrollArea            | ✅ 已修                         |
| P2     | Panel / settings-card → Card           | ✅ 已修（几何差 1–2px，见 3.1） |
| P2     | `.share-badge` → Badge                 | ✅ 已修                         |
| P2     | `.upload-cta` → Button                 | ⛔ 评估后不做（见 3.3）         |
| P2     | `.data-list` → Table                   | ⬜ 待办（可选）                 |
| P3     | 18 处 `Button size="2"`                | ✅ 已修                         |
| P3     | PanelHeader 四层嵌套、空 CSS 规则      | ✅ 已修                         |
| P4     | 规范加固（AGENTS / SKILL / 案例库）    | ✅ 已落地                       |
| P5     | Scale 对齐（space/type/radius/weight） | ✅ 已落地（见第 10 章）         |
| P6     | 静态检查工具化（stylelint）            | ⬜ 待评估（现在能查「自定值」） |

---

## 10. Scale 对齐（已落地）

前九章解决的是「用不用 Radix 组件」，本章解决的是「用不用它的度量」。项目原先有 60+ 处落在档位缝隙里的自定值，同一语义出现六七种数值。

### 10.1 问题形状

| 尺度      | Radix 档位                               | 改前项目实际值                                                                       |
| --------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Space     | 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64 | 1,2,3,5,**6**,**7**,9,**10**,**11**,**14**,**18**,**20**,**22**,**28**,34,38         |
| Font size | 12 / 14 / 16 / 18 / 20 / 24 / 28         | 9.5,**10.5**(16处),**11**(7),**11.5**(9),12,**12.5**(5),**13**(4),14,**15**(5),21,26 |
| Radius    | 3 / 4 / 6 / 8 / 12 / 16                  | 6,7,8,9,**14**,**10**（两个自定义令牌 + 六种混用）                                   |
| Weight    | 300 / 400 / 500 / 700                    | 500,**600**(13),**650**(4),**680**(1),700                                            |

后果不是「不好看」，而是**不可预测**：`gap` 有 6/7/10/11/18/20 六种，`padding` 有 7/9/10/12/14/16/18/20/22 九种，没人能说出「卡片内间距」到底是多少。而且这些值只能写进 CSS，于是 CSS 越写越长，又是原则 3 双写的温床。

### 10.2 决策

| 轴       | 决策                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Type     | **全部对齐**。10.5 / 11 / 11.5 / 12.5 → 12；13 → 14；15 → 16；21 → 20；26 → 24。字号种类 8 → 3（12/14/16） |
| Space    | 就近取整；平局时 **`gap` / `margin` 向上、`padding` 向下**（元素间透气，容器内边距不虚胖）                 |
| Weight   | 600 → 500；650 / 680 → 700。5 档 → 3 档（400/500/700）                                                     |
| Radius   | 全收敛：14 / 10 / 9 / 8 / 7 → `--radius-4`(8px)，6 → `--radius-3`(6px)；删 3 个自定义令牌                  |
| 固定尺寸 | **豁免**。`width` / `height` / `maxWidth` / 容器宽高按几何关系取值，档位里没有对应值                       |
| 字距     | 负值全部 token 化（`--letter-spacing-8/9`）；大写小标签的 `0.01~0.09em` 当时保留，第 11 章已全部删除       |

### 10.3 落地结果

| 项                                                         | 数量                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| props 取档（`gap="11px"` → `gap="3"`）                     | 138 处                                                                       |
| CSS token 化（`font-size: 11.5px` → `var(--font-size-1)`） | 166 处                                                                       |
| 补配对行高（有字号无行高的规则）                           | 36 处                                                                        |
| 删除自定义令牌                                             | 3 个（`--app-radius-panel` / `--app-radius-control` / `--app-shadow-panel`） |

CSS 行数 1457 → 1481（**+24**）。这是本章唯一「不划算」的数字：补 36 处配对行高与 3 处说明性注释，抵掉了删掉的规则。但换来的是**每个字号都有确定的行高**，不再依赖继承。

### 10.4 观感变化（都是刻意的）

| 项         | 改前                      | 改后                    | 影响面                                    |
| ---------- | ------------------------- | ----------------------- | ----------------------------------------- |
| 次要文字   | 10.5 / 11 / 11.5px        | 12px                    | 32 处，放大约 10~14%，项目最大的一类变化  |
| 卡片圆角   | 14px                      | 8px                     | 全站卡片明显变方，与控件（8px）首次统一   |
| 卡片内边距 | 20px                      | 16px                    | 内容更贴边                                |
| 标题字重   | 600                       | 500                     | 标题对比略减弱，与 `weight="medium"` 合流 |
| 行高       | 继承 1.5 / 局部 1.15~1.65 | 与字号配对（16/20/24…） | 多行文本变高，单行标签盒子收紧            |
| 面板标题   | 15px / 600                | 14px / 700              | 更小更重，层级靠字号 + 字重双通道         |

### 10.5 读回来的实际值

CDP 实测（`1280×800`，`scaling="100%"`）：

| 元素                      | 字号 / 行高                   | 字重 | 圆角 | padding | gap         |
| ------------------------- | ----------------------------- | ---- | ---- | ------- | ----------- |
| `.panel-title`            | 14 / 18（第 11 章又压了 2px） | 700  | —    | —       | 字距 normal |
| `.panel-description`      | 12 / 16                       | 400  | —    | —       | —           |
| `.settings-group-title`   | 16 / 22（同上）               | 500  | —    | —       | —           |
| `.stat-label`             | 12 / 16                       | 500  | —    | —       | —           |
| `.choice-cell`            | —                             | —    | 4px  | 8px     | 8px         |
| `.stat`                   | —                             | —    | 6px  | 12px    | —           |
| `.nav-item`               | —                             | —    | 8px  | 8px     | 12px        |
| `.app-card` / `.app-main` | —                             | —    | 8px  | 0       | —           |

三页截图（扫描 / Excel / 设置）核对：无文字截断、无换行异常、无元素溢出，侧边栏 242px 宽度下导航文字仍单行。

### 10.6 因此写进规范的两条

`AGENTS.md` 原则 3 新增尺度表与两条边界（固定尺寸豁免、圆形/胶囊用 `radius="full"`），并明确「就近取整、平局按属性方向」。当时还写了一条「大写标签字距例外」——第 11 章已删除，因为它与「size 决定一切」冲突。`SKILL.md` 自查清单新增「有没有自定值」一条，改共享组件前必须过。

---

## 11. 字号三件套：size 是唯一真相源（已落地）

第 10 章把字号数值对齐到了 Radix 档位，但**对齐的是数值，不是来源**——字号仍由 CSS 手写，只是写成了 token。本章解决来源问题。

### 11.1 问题形状

Radix 的 type scale 里，一个 `size` 同时定义三件事，机制是局部 CSS 变量：

```css
.rt-Text {
  line-height: var(--line-height, ...);
  letter-spacing: var(--letter-spacing, inherit);
}
.rt-Text:where(.rt-r-size-1) {
  font-size: var(--font-size-1);
  --line-height: var(--line-height-1);
  --letter-spacing: var(--letter-spacing-1);
}
```

项目 CSS 后加载，所以再写一条 `font-size` / `line-height` 就会直接盖掉它。三类问题：

| 类型           | 数量 | 表现                                                                                               |
| -------------- | ---- | -------------------------------------------------------------------------------------------------- |
| A. 冲突        | 3    | `.choice-label` 是 `size="2"` 却渲染成 12px；`.page-shell-description` 是 `size="1"` 却渲染成 14px |
| B. 同值冗余    | 19   | `size="1"` 配 `font-size-1` + `line-height-1`，值一样，prop 全程是死的                             |
| C. 没有 `size` | 11   | 压根没挂 prop，用 CSS 手搓整套（`.panel-title`、`.stat-value`、`.brand-name` 等）                  |

A 类最危险：代码写 `size="2"`，实际渲染 12px，只有量 `getComputedStyle` 才能发现。

### 11.2 决策

| 问题                          | 决策                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 冲突三项按哪边                | **删 CSS 迁就 prop**。接受视觉变化：`.choice-label` 12→14px、`.settings-row-value` 12→14px、`.page-shell-description` 14→12px |
| 同值冗余怎么处理              | 三件套全删（含 `.stat-label` 的 `0.01em`、`.stat-unit` 的 `0`），一条不留                                                     |
| 无 `size` 的 11 处            | 全部改成 `size` / `weight` prop                                                                                               |
| `Heading` 行高变紧 2px        | **接受**。不为此写 `line-height`                                                                                              |
| 大写小标签的正字距            | **删**。0.09em / 0.02em / 0.01em 全部回到 Radix 档位（`0.0025em`）                                                            |
| 容器（`Flex`/`Grid`）上的字号 | 下沉到最内层 `Text` 的 `size`                                                                                                 |

用户连续两次拒绝对「大写标签字距」开白名单，方向是**零例外**：只要元素能拿到 `size`，就不允许手写排版属性。

### 11.3 落地结果

| 项                                                  | 数量                              |
| --------------------------------------------------- | --------------------------------- |
| 删除 `font-size` / `line-height` / `letter-spacing` | 116 条                            |
| 删除 `font-weight` 块（迁到 `weight`）              | 21 块                             |
| 补 `size` / `weight` prop                           | 12 个组件、约 40 处               |
| 涉及文件                                            | 18 个 CSS + 12 个 tsx             |
| 剩余 `font-size`                                    | 3 处，全在 `.rdp-*`（第三方类名） |
| 剩余 `letter-spacing`                               | 0 处                              |

CSS 行数 1481 → **1329**（−152）。这是第 10 章 +24 行的反向修正：那 36 处配对行高本来就是多余的。

### 11.4 观感变化（都是刻意的）

| 项                        | 改前            | 改后         | 原因                                                                          |
| ------------------------- | --------------- | ------------ | ----------------------------------------------------------------------------- |
| `.panel-title` 行高       | 20px            | 18px         | `Heading` 的路由是 `--heading-line-height-N`，size 2 比 Text 紧 2px           |
| `.settings-group-title`   | 16 / 24         | 16 / 22      | 同上，size 3                                                                  |
| `.choice-label`           | 12px            | 14px         | `size="2"` 终于生效                                                           |
| `.settings-row-value`     | 12px            | 14px         | 同上                                                                          |
| `.page-shell-description` | 14px            | 12px         | `size="1"` 终于生效                                                           |
| 大写标签字距              | 0.09em ≈ 1.08px | 0.03px       | 回到 Radix 档位；项目里这些标签是中文，`uppercase` 本就不起作用               |
| 标题负字距                | −0.14 / −0.6px  | 走 size 档位 | `.panel-title` 从 −0.01em 变 `normal`，`.page-title` 保持 Radix 的 −0.00625em |

### 11.5 读回来的实际值

CDP 实测（`1280×800`）：

| 元素                    | 字号 / 行高 | 字重 | 字距    |
| ----------------------- | ----------- | ---- | ------- |
| `.page-title`           | 24 / 30     | 700  | −0.15px |
| `.panel-title`          | 14 / 18     | 700  | normal  |
| `.panel-description`    | 12 / 16     | 400  | 0.03px  |
| `.settings-group-title` | 16 / 22     | 500  | normal  |
| `.settings-row-label`   | 14 / 20     | 500  | normal  |
| `.settings-row-value`   | 14 / 20     | 500  | normal  |
| `.stat-label`           | 12 / 16     | 500  | 0.03px  |
| `.stat-value`           | 20 / 28     | 700  | −0.1px  |
| `.choice-label`         | 14 / 20     | 400  | normal  |
| `.nav-group-label`      | 12 / 16     | 500  | 0.03px  |
| `.brand-name`           | 16 / 24     | 700  | normal  |
| `.upload-title`         | 16 / 24     | 700  | normal  |
| `.progress-value`       | 16 / 24     | 700  | normal  |

全站硬校验（遍历六条路由下所有 `.rt-Text` / `.rt-Heading` / `.rt-Badge`，比对 `size` 档位与实际 `font-size`、`Heading` 的 `line-height`）：**0 处不符、0 处缺 `size`**。

### 11.6 写进规范

- `AGENTS.md` 原则 3：尺度表把 Font size / Line height / Letter spacing / Weight 的 CSS 列改为「不写」；新增「字号只由 `size` 决定」「`Text` 与 `Heading` 同 size 不等价」两条；删掉原「字距唯一例外」。
- `AGENTS.md` 原有一条 **「`Text` / `Heading` 的 `size` 不要因为 CSS 覆盖了就删」是错的**，正是它把 19 处遗留成了死代码，已改写。
- `SKILL.md` 自查清单：新增「有没有手写字号三件套」「Heading 和 Text 的 size 对过吗」，并把「被 CSS 覆盖 `font-size` 的 `Text size` 要留」改为「`Text` / `Heading` 的 `size` 不适用删默认值」。
- `anti-patterns.md`：新增 1.1 节，含两侧不一致的真实前后代码与「唯一例外是第三方类名」的判定口径。
- `README.md`：UI 约定补一条来源规则。

---

## 12. 三条新规则与配套约束（已落地）

前两轮把「双写」和「字号三件套」收干净了，但它们只是「同一个值不要写两遍」。
这一轮要解决的是**值写在哪一层**：props 到底挂在哪个组件上。三条规则 + 三条派生约束。

### 12.1 规则一：文字必须在 Typography 里

`<Flex>一段话</Flex>`、`<Box>标签</Box>` 这种「文字直接挂在布局组件上」的写法全部改掉，
中间套一层 `Text` / `Heading`。

**为什么**：`color` / `weight` / `align` / `size` 都在 `Text` 的 API 里，挂在容器上时这些语义只能由
CSS 猜测（继承 or 后代选择器），容器一旦有多个子节点就分不清谁该是什么颜色。
实测 `Text` 的 prop 集合里没有 `gap` / `padding` / `margin`，容器的 prop 集合里没有 `color`——
两者的职责边界是组件库自己划的，顺着它走就不用发明规则。

```tsx
// ❌ 前（plant-machine-picker 的跳过列表）
<Box className="skipped-list">未扫描的机台：{list.join('、')}</Box>

// ✅ 后：文字进 Text，颜色交给它们的 color prop
<Text as="span" size="1" color="gray">{intro}</Text>
```

### 12.2 规则二：布局用多个组件配合，一个容器不干多件事

判据是**有没有裸布局声明**（`display` / `flex-*` / `align-items` / `justify-content` / `gap` / `padding` 的裸值），
不是声明条数。一条 `display: flex` 和十条 `display + gap + padding + align + …`一样算违规——
只要元素是 Radix 布局组件，这些就该是 props。

```tsx
// ❌ 前（excel.css .upload-cta）：一条 class 同时管排版、布局、外观
.upload-cta {
  display: inline-flex; align-items: center; gap: 8px;
  align-self: center; padding: 4px 12px;
  border: 1px solid var(--gray-a6); border-radius: var(--radius-2);
  background: var(--app-surface); color: var(--gray-12);
}

// ✅ 后：Flex 管方向/对齐/间距，剩下的只管「这个盒子的外观」
<Flex className="upload-cta" display="inline-flex" align="center" gap="2">
.upload-cta { align-self: center; margin-top: var(--space-1); padding: var(--space-1) var(--space-3);
              border: 1px solid var(--gray-a6); border-radius: var(--radius-2);
              background: var(--app-surface); box-shadow: 0 1px 1px var(--gray-a3); }
```

**一个必须小心的坑**：CSS 原值 `space-2`（8px）与 prop `gap="1"`（4px）不是一回事。
删 CSS 前先确认原生效值，否则迁移后间距会悄悄变——这一轮踩到过一次。

### 12.3 规则三：不写组件自带的默认值

| 组件      | 默认值                                          |
| --------- | ----------------------------------------------- |
| `Text`    | `as="span"`，**无默认 size**（继承 16px）       |
| `Heading` | `as="h1"`，`size="6"`                           |
| `Badge`   | `size="1"`                                      |
| `Button`  | `size="2"`，`variant="solid"`                   |
| `Flex`    | `as="div"`，`display="flex"`，`direction="row"` |

**唯一的例外是 `size`**：它是字号三件套的唯一来源，即使正好等于默认档也必须显式写。
第 11 章曾有一条旧规则「`Text` / `Heading` 的 `size` 不要因为 CSS 覆盖了就删」——
反过来读容易误伤成「默认值也可以写」，这轮把两者的边界写清楚了。
另有一条旧文档写「`Text size="2"` 是默认值」，**是错的**，`Text` 没有默认 `size`，已在 `SKILL.md` 更正。

本轮删除的默认值：`variant="solid"` ×2、`as="h1"` 若干、`Flex` 的 `display="flex"` 与 `direction="row"`。

### 12.4 派生约束一：颜色也必须下沉

用户拍板的判据很干脆——**`Text` 有 `color` 这个 prop，那颜色就是它的事**，和间距下沉到 `Flex` 同理。

本轮下沉：`stat-label` / `stat-unit`、`data-row-machine` / `data-row-value`、`progress-meta`、
`skipped-list`、`target-dir`、`history-time` / `history-stats`、`panel-description`、`field-label`、`sidebar-meta`。
`data-state` / `data-tone` 这些只为 CSS 状态色服务的挂点随之删除。

**但 `Text` 的 `color` 有两个真实边界**（不是偷懒，量过才算）：

1. **给不到 9 / 10 阶。** 具名色 = 11 阶，加 `highContrast` = 12 阶，中间没有档位。
   `.stat-label` 要的是 `gray-10`、`.stat-unit` 要的是 `gray-9`，只能留 CSS 并写注释。
2. **没有「跟随主题强调色」的选项。** `app.tsx` 是 `accentColor="indigo"`，但 `Text` 的 `color` 只接受具名色名，
   所以 `Stat` 的 `accent` 语气写死 `'indigo'`——改主题必须同步改 `stat.tsx` 的 `TONE_COLOR`，代码里有注释提醒。

还有一个观感变化值得记下：`Text color="indigo"` 实际渲染的是 `--indigo-a11`（alpha 版），
实测 `rgba(0, 43, 183, 0.773)`，不是实色 `--indigo-11`。这是 Radix 的设计选择（彩色文字带透明度以适配背景），
接受，不覆盖。

**`STATUS_TEXT_COLOR` / `TONE_COLOR` 的设计意图**：颜色下沉最怕的是「改一个语气要翻五个文件」。
所以语气到颜色的翻译集中在两张表里，`branchState()` 出语气、表出颜色，CSS 里不再有状态色选择器。
以后加一个语气 = 加一行表项。

### 12.5 派生约束二：stylelint 硬拦截

规则写进文档靠自觉，靠不住（第 11 章那 19 处就是这么长出来的）。所以把最不容易看出来的两条做成机器拦截：

```js
// .stylelintrc.mjs
'declaration-property-value-disallowed-list': {
  'font-size': ['/.*/'],
  'letter-spacing': ['/.*/'],
}
```

只拦这两条，因为它们是「写了就看不出错、但会把 prop 变死」的那类。布局类声明不拦——
`display` / `gap` 在原生 `<label>`、`NavLink`、第三方组件上仍是合法写法，用正则拦会产生大量误报，
那类靠 code review 与本章的例外清单把关。

已用故意写违规的方式验证截得住；**首次接入即零违规**（第 11 章已把字号收干净）。
`date-picker/*.css` 单独 override 放开——那是 react-day-picker 自己的类名，拿不到 prop，属真实例外。

### 12.6 派生约束三：例外要写清楚，别拿例外当借口

本轮逐条确认过的技术例外，都已在代码里留注释：

| 位置                                                                          | 为什么不能迁                                                                |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `.rdp-*`（3 处字号）                                                          | react-day-picker 生成的 DOM，类名拿不到 React prop                          |
| `.stat-label` / `.stat-unit`                                                  | `Text color` 给不到 9 / 10 阶                                               |
| `.share-badge[data-tone='muted']`                                             | `Badge` 色名同样只到 11 阶                                                  |
| `.nav-item`（`display` / `gap` / `padding`）                                  | 必须是 `<NavLink>` 渲染的 `<a>`（提供 `aria-current` 与客户端跳转）         |
| `.upload-zone`（`display` / `gap` / `text-align`）                            | 根节点是原生 `<label>`，点击触发文件选择；`text-align` 作用于 inline 子节点 |
| `.upload-zone:hover .upload-cta-label` / `.nav-item[aria-current] .nav-label` | `Text` 的 `color` 是静态 prop，响应不了祖先状态                             |
| `.nav-icon` / `.inline-hint svg` / `.status-dot`                              | 给 svg 与图形上色，不是文字                                                 |
| `.path-strip` / `.target-dir`（`font-family`）                                | `Text` 没有 `font-family` prop；等宽字体靠容器继承                          |
| `.choice-cell[data-selected] .choice-label`                                   | 状态强调的字重，表达的是状态差异不是排版基线                                |
| `Popover.Content`（`overflow`）                                               | Popover 没有 overflow prop                                                  |

**怎么区分例外和偷懒**：例外都能指到一个**具体的技术原因**（哪一方的类名、哪个 prop 不存在、哪个档位给不到），
并且原因写在代码注释里。写不出这句话的，就是偷懒。

### 12.7 落地结果

- CSS：1329 → 1292 行，21 个文件（`update.css` 整个文件删除，22 → 21）。行数只减 37，是因为每处例外都按规范补了注释——删掉的是逻辑，留下的是理由。
- tsx：`data-state` 挂点全部删除（仅剩 `help-tip` 那处 Radix 自己下发的 `[data-state='open']`）；`data-tone` 从「给 CSS 选状态色用」收缩为「只给图形上色」（`.status-dot` 与共享徽标，共 3 处），文字色改由两张映射表决定。
- 新增：`.stylelintrc.mjs`，`pnpm lint` 变为 `eslint . && stylelint "src/**/*.css"`
- 验证：`typecheck` / `lint`（含 stylelint 首跑 0 违规）/ `format:check` / `build` 全通过；CDP 实测 `.stat-value` 默认态 `rgb(28,32,36)`（= gray-12）、`.stat-label` `rgb(128,131,141)`（= gray-10），四格统计与截图视觉无回退

### 12.8 写进规范

- `AGENTS.md` 原则 3：新增四条（文字必须在 Typography 里、容器不承担文本样式、一个容器不干多件事、不写默认值），补颜色两条边界与「颜色压在容器上的合理情形」清单。
- `.claude/skills/radix-themes/SKILL.md` 自查清单：新增四条 + 默认值表格；删掉错误条目「`Text size="2"` 是默认值」。
- `anti-patterns.md`：新增第 8、9、10 节（文字塞进布局组件、容器干多件事、颜色留在容器上）。
- `README.md`：UI 约定补出处规则。

---

## 13. 间距简写失效：8 处 padding 一直是 0（已修）

### 13.1 问题形状

设置页的卡片里，文字与控件**紧贴边框**。第一反应是「间距给小了」，实际是 padding **完全没有**。

代码写的是 `p="2 4"`，看起来是 CSS 的 `padding: 8px 16px`。但 Radix 的 spacing props 类型是
`enum | string`，字符串被当作 CSS 值原样写入变量：

```html
<div class="rt-r-p" style="--p: 2 4"></div>
```

```css
.rt-r-p {
  padding: var(--p);
} /* padding: 2 4 → 缺单位 → 整条声明被丢弃 */
```

计算值 `0px`。TypeScript 不报（类型允许任意 string），stylelint 不管（不在 CSS 里），
code review 也看不出（`2 4` 在 CSS 里合法）。**只有量 `getComputedStyle` 才会暴露。**

### 13.2 波及面

| 文件                   | 写法        | 修复后                                 |
| ---------------------- | ----------- | -------------------------------------- |
| `settings-row.tsx`     | `p="2 4"`   | `py="2" px="4"` → `8px 16px`           |
| `empty-state.tsx`      | `p="6 4"`   | `py="6" px="4"` → `32px 16px`          |
| `copy-panel.tsx`       | `p="1 2"`   | `py="1" px="2"` → `4px 8px`            |
| `copy-progress.tsx`    | `p="2 3"`   | `py="2" px="3"` → `8px 12px`           |
| `history-panel.tsx` ×2 | `p="2 3"`   | `py="2" px="3"` → `8px 12px`           |
| `scan-task-panel.tsx`  | `p="1 2"`   | `py="1" px="2"` → `4px 8px`            |
| `app-sidebar.tsx`      | `p="2 2 1"` | `pt="2" pb="1" px="2"` → `8px 8px 4px` |

全部 8 处在修复前都是 `padding: 0px`。**这个 bug 从迁 props 那天就存在**，
只是设置页内容多、边框近，最先被看出来。

### 13.3 决策

| 问题         | 决定                   | 理由                                                                                      |
| ------------ | ---------------------- | ----------------------------------------------------------------------------------------- |
| 修几处       | 全部 8 处              | 同一类错误，留着就是下一个人再踩一遍                                                      |
| 垂直方向     | 一起给 `py="2"`（8px） | 单行 20+16=36 < `minHeight` 52，行高不变；带说明的行才真正透气，不再靠 `minHeight` 的巧合 |
| 内边距层级   | 加在每一行上           | 分隔线（`border-top` 在行上）贯通到卡片边缘，行与行视觉连续                               |
| 控件宽度上限 | 保持 `maxWidth="50%"`  | 卡片 736px、行可用 704px、半栏 352px、分段控件 349px，余 3px 够用                         |

### 13.4 读回来的实际值

CDP 实测（1280×900）：

| 元素                             | 修复前                | 修复后                             |
| -------------------------------- | --------------------- | ---------------------------------- |
| `.settings-row`                  | `0px`（`--p: 2 4`）   | `8px 16px`（行高仍 52px）          |
| `.settings-row-label` 距卡片左边 | 0px                   | **16px**                           |
| `.settings-segmented` 距卡片右边 | 0px                   | **16px**（宽度仍 349px，未被压缩） |
| `.empty-state`                   | `0px`（`--p: 6 4`）   | `32px 16px`                        |
| 侧边栏状态行                     | `0px`（`--p: 2 2 1`） | `8px 8px 4px`                      |

`typecheck` / `lint` / `format:check` / `build` 全通过。

### 13.5 一个必须记住的教训

第 12 章的验证表曾把 `.empty-state` 记成 `padding: 34px 20px`，并标了 ✅。
那是从旧 CSS 抄来的数字，**不是从渲染里读的**——实际一直是 0，错误因此被"验证"掩盖了一整轮。

> 验证表里的每个数字都必须来自 `getComputedStyle`，不能从源码推算。

### 13.6 写进规范

- `AGENTS.md` 原则 3：新增「间距 prop 不接多值简写」。
- `SKILL.md` 自查清单：新增同一条 + 自查命令。
- `anti-patterns.md`：新增第 11 节，含编译产物对照与 8 处清单。

---

## 14. 规则下沉：README / AGENTS → skill（已落地）

### 14.1 问题形状

`AGENTS.md` 共 94 行，其中**原则 3 独占 55 行**（58%），23 个子条目，含尺度表、字号机制、
颜色边界、双写反例、例外清单。`README.md` 的「UI 约定」22 条里另有 7 条是同一批规则的缩写版。

两个后果：

1. **Context load**：这 55 行是 always-loaded 的，不管这一轮是否改 UI，每轮都付 tokens 与注意力。
2. **两处真相**：README 与 AGENTS 各写一遍，措辞不同，改一处漏一处。曾有 README 写「`size` 例外」
   而 AGENTS 写「不要因为 CSS 覆盖了就删」的矛盾，害得 19 处 prop 变成死代码（第 11 章）。

更别扭的是依赖方向：`SKILL.md` 开头写着「样式归属以 `AGENTS.md` 原则 3 为准，本文件不重复」——
**细则常驻在最贵的文件里，按需加载的 skill 反而空着**。

### 14.2 决策：按信息层级重排

| 位置                          | 角色                   | 变化                                                           |
| ----------------------------- | ---------------------- | -------------------------------------------------------------- |
| `AGENTS.md` 原则 3            | always-loaded 原则     | 55 → 4 行：原则 + 两条硬约束 + 带触发条件的指针                |
| `README.md` UI 约定           | 人类上手的项目事实     | 22 → 13 条：删 7 条 Radix 细则，留一句指针                     |
| `SKILL.md`                    | agent 入口（按需加载） | 承载红线 + 三条分工原则 + 自查清单（触发词）+ 接入 checklist   |
| `references/rules.md`（新建） | disclosed reference    | 规则全文：机制、尺度表、字号、颜色、布局分工、默认值、例外清单 |

### 14.3 关键做法

- **清单项改成触发词，解释下沉。** 每条自查项只留一句判据 + 小节号（`（rules §1）`），
  不再在清单里展开机制与反例代码。清单是「照着走」，rules 是「要查证才读」。
- **规则与例外 co-locate。** 颜色一节里同时放：下沉原则、色阶给不到 9/10 阶的边界、
  没有 `accentColor` 的边界、容器色可以留的三种情形。此前这些散落在 AGENTS 的四个位置。
- **pointer 带 branch。** 不是「详见 skill」，而是「动 UI 前读自查清单，改完按清单过一遍」、
  「判断某处留 CSS 是否正当查第 7 节」、「按现象找改法查 anti-patterns.md」——每条路径各自触发。
- **单一真相。** AGENTS 删掉的每一条，在 `rules.md` 都有且只有一个位置；README 不再复述。

### 14.4 结果

| 文件                  | 迁移前 | 迁移后 | 说明                          |
| --------------------- | ------ | ------ | ----------------------------- |
| `AGENTS.md`           | 94     | 45     | 原则 3 从 55 行降到 4 行      |
| `README.md`           | 301    | 295    | 删 7 条细则，加 1 条指针      |
| `SKILL.md`            | 106    | 107    | 清单精简，新增三条分工原则    |
| `references/rules.md` | —      | 280    | **disclosed，只在触发时加载** |

常驻 context 净减约 50 行；细则总量不变，但从「每轮都付」变成「用到才付」。

### 14.5 验证

- 逐条对照：AGENTS 原则 3 原 23 个子条目、README 原 7 条细则，全部能在 `rules.md` 找到对应位置
- 无悬空引用：全仓库 `grep '原则 3'`，剩下的都是审计文档里的历史记录（已在文首加说明）
- `pnpm format:check` 通过

---

## 15. 不重写主题已分发的值（已落地）

出发点：`Theme` 在根下发整套令牌，组件再从令牌派生外观，所以后代单独定义圆角、颜色、缩放
在绝大多数情况下没有意义。先按「有没有破规则」全量扫了一遍，结论是**破坏面很小**：

| 检查项                                                             | 结果                                          |
| ------------------------------------------------------------------ | --------------------------------------------- |
| 后代组件显式写 `radius` / `appearance` / `scaling` / `accentColor` | **0 处**                                      |
| CSS 里的硬编码颜色（hex / `rgb()` / 具名色）                       | **0 处**                                      |
| 覆盖 Radix 令牌（`--gray-*` / `--radius-*` / `--space-*`）         | **0 处**                                      |
| `border-radius` 的来源                                             | 32 处全走 `var(--radius-N)`，随 `radius` 缩放 |

真正的问题是**值与上游逐字相同**的声明。判据只有一条：删掉它，`getComputedStyle` 是否一模一样。

### 15.1 清掉的四类

| 形态             | 位置                                                                                                                                            | 为什么冗余                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 组件默认 prop    | `app.tsx` 的 `accentColor="indigo"` / `radius="medium"` / `scaling="100%"`                                                                      | 与 Radix 默认值逐字相同                         |
| reset 已归零     | `.empty-title` / `.panel-title` / `.page-title` / `.upload-title` / `.settings-row-label` / `.empty-description` / `.field-hint` 的 `margin: 0` | `.rt-Text` / `.rt-Heading` 本来就是 `margin: 0` |
| 根已继承的文字色 | 同上的 `color: var(--gray-12)`（5 处）                                                                                                          | `.radix-themes` 本来就是 `gray-12`              |
| 组件已算出的圆角 | `.app-card` 的 `--base-card-border-radius: var(--radius-4)`                                                                                     | Card 默认 `size="2"` 算出来正是 `--radius-4`    |

另外把 `.nav-group-label` 的 `padding: 0 10px 8px` 落回档位（`0 var(--space-2) var(--space-2)`），
并删掉 `text-transform: uppercase`——分组标签是中文，这条从来不起作用。

`color: var(--gray-10)`（6 处说明文字）保留：`Text color="gray"` 只到 11 阶，10 阶表达不了。

### 15.2 focus 环：`--focus-8` 与 `--accent-8` 不是一回事

原来有一条 `.app-shell :focus-visible { outline: 2px solid var(--accent-8) }`。看着像「给全站补焦点环」，
实际在覆盖 Radix 自己的规则，而且用的令牌解析位置不同：

- `--focus-8` 在 `.radix-themes` 上声明为 `var(--accent-8)`，**在根作用域求值**，始终是主题强调色；
- 规则里写 `var(--accent-8)` 是在**元素作用域**求值，`color="gray"` 的按钮上会解析成灰色。

所以删掉它之后，Radix 组件回到自己的 `--focus-8`：灰按钮的焦点环从灰变靛蓝，输入框与单选从
「双层环」变「单层环」（Radix 在 wrapper 的 `:focus-within` 与 Radio 的 `::before` 上本来就画了）。

只保留一条收窄的规则给原生可聚焦元素，Radix 组件不再被触碰：

```css
.app-shell :is(a, label, summary):focus-visible {
  outline: 2px solid var(--focus-8);
  outline-offset: 2px;
}
```

### 15.3 实测对比

改动前先采集 22 个选择器 × 11 个属性作基线，改完重启应用逐项比对：

| 对象                                                                     | 结果                                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `.page-title` / `.empty-title` / `.upload-title` / `.settings-row-label` | 11 个属性全等（类名删除后按结构路径定位）                            |
| `.app-card`                                                              | `border-radius` 仍 `8px`                                             |
| `.nav-item[aria-current]` / `.nav-icon`                                  | 颜色、内边距全等                                                     |
| `.nav-group-label`                                                       | `padding-left` 10 → 8px、`text-transform` uppercase → none（预期内） |
| Tab 走 12 步的焦点环                                                     | 导航项保持 2px 靛蓝；Radix 组件回到 `--focus-8`（见 15.2）           |

CSS 1280 行（本轮 −12），文件 20 个（`page-header.css` 删空后整个删除）。

`typecheck` / `lint`（含 stylelint）/ `format:check` / `build` 全部通过。

### 15.4 一条判断边界

「看起来像默认值」不能作为删除依据。`.stat-label` 的 `gray-10`、`.empty-description` 的
`gray-10` 都长得很像「随便写的灰色」，但 `Text` 的 `color` 只到 11 阶，删了它们字色会变浅一档。
判据只能是把声明删掉、量 `getComputedStyle`，不能靠读代码下结论——第 13 章那个「padding 记成
34px 其实一直是 0」就是反例。

## 16. `Text` 的盒子边界（已落地）

### 16.1 起点是一个误判

提问是：「`Text` 没有 margin、padding 等布局属性，要给 `Text` 添加这些布局属性，是否应将其包裹在 Layout 组件中？」

前半句只有一半成立。`Text` **有**完整的 margin prop（`m` / `mx` / `my` / `mt` / `mr` / `mb` / `ml`），只是没有 padding。三处证据：

| 来源     | 说明                                                                                    |
| -------- | --------------------------------------------------------------------------------------- |
| 官方文档 | `Text` 页首句「supports common margin props」，示例里有 `<Text as="p" mb="5" size="4">` |
| TS 类型  | `interface CommonTextProps extends MarginProps, TextOwnProps`                           |
| 实现     | `extractProps(props, textPropDefs, marginPropDefs)`——margin 是第二个 prop 组            |

官方 prop 表不列 margin，因为它被归到 overview/layout 的「通用 prop」里。这个「表里没有 ≠ 不支持」的陷阱，是误判的直接来源。

因此「给文字加间距要不要包一层」这个问法本身就不成立——间距用 `mb="2"` 就够。

### 16.2 判据：只有「有可见边界」才包盒

`Text` 缺的是 padding。但 padding 与 margin 的差别，**只在盒子有可见边界时才显现**。

实测 `.nav-group-label`（`<Text as="div">`，无背景无描边）把 `padding: 0 8px 8px` 换成 `margin: 0 8px 8px`：

| 指标           | padding | margin             |
| -------------- | ------- | ------------------ |
| 文字左偏移     | 8px     | 8px                |
| 下一个兄弟 top | 24px    | 24px               |
| 文字底部到兄弟 | 9px     | 9px                |
| 自身盒高       | 24px    | 16px（无视觉影响） |

于是四类分法：

| 你要的效果                   | 做法                                | 包不包                 |
| ---------------------------- | ----------------------------------- | ---------------------- |
| 与兄弟元素的间距             | 父容器 `gap`（优先），或 `m*` prop  | 不包                   |
| 无背景/描边的「缩进」        | `m*` prop                           | 不包                   |
| 有背景/描边/圆角的**内边距** | `Box` / `Flex` 包，padding 加在容器 | 包                     |
| 作为 flex 子项的收缩与截断   | 留 CSS（`flex` / `min-width: 0`）   | 不包（包了截断会失效） |

第三类是唯一需要包的，但理由不是「绕开 `Text` 的限制」——**那个盒子本来就该存在**，只是此前被 `Text` 代劳了。

### 16.3 为什么「仅为 padding 包一层」是坏模式

多一层 DOM、改变 flex 上下文（原本 `Text` 是 item，包完变成 `Box` 是 item）、`truncate` 的参考宽度变了、hover 热区归属变乱。而最要命的是第 5 条：**它掩盖了归属错误**——给文字加内边距，绝大多数时候该调的是祖容器的 padding。

### 16.4 两处「看起来像缺 prop」其实有 prop

| 想要     | 别再写                                              | 改用它     | 实测                                                                                                |
| -------- | --------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| 块级排列 | CSS `display: block`                                | `as="div"` | `<span>`+block 与 `<p>` 的 `display` / `font-size` / `line-height` / 盒子尺寸逐项相同，兄弟位置不变 |
| 单行截断 | `overflow` + `text-overflow` + `white-space` 三件套 | `truncate` | 生成 `.rt-truncate`，三条声明完全一致                                                               |

### 16.5 改动清单

| 位置               | 原来                                        | 现在                                                                                      | 判据                            |
| ------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| `.nav-group-label` | CSS `padding: 0 8px 8px`                    | `mx="2" mb="2"`，CSS 只留 `color`                                                         | 无边界 → margin 等价            |
| `.sheet-footer`    | `Text` 自带 `padding: 8px 0` + `border-top` | `<Box py="2">` 包 `Text`，CSS 只留 `border-top`                                           | 有分隔线 → 确实是盒子           |
| `.stat` 两格       | CSS `margin-top` / `margin-left`            | 父 `Flex gap="1"` + `ml="1"`；两处 `display: block` → `as="div"`；截断三件套 → `truncate` | 块级走容器，行内走 prop         |
| `.file-meta-item`  | `<Box>` + CSS `padding` / `margin-top`      | `<Flex direction="column" gap="1" py="2" px="3">`                                         | 有边界的卡片 → 容器管间距与内距 |

顺带：`.file-meta` 的 `display: grid` + 列模板 + `gap` 三条与 `<Grid columns="3" gap="2">` 逐字重复，整条删除；`.stat-value` / `.file-meta-value` 删空后连 className 一起清掉。

### 16.6 复验数据

| 对象                | 结果                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `.stat`             | `row-gap: 4px`（= 原 `margin-top: var(--space-1)`）；第二格 top 仍 **268**，与改动前基线一致                                    |
| `.stat` 两个 `Text` | 均为 `DIV` + `display: block`；第二格 `overflow: hidden` / `white-space: nowrap` / `text-overflow: ellipsis` 由 `truncate` 提供 |
| `.stat-unit`        | `margin-left: 4px`，`gray-9` 不变                                                                                               |
| `.nav-group-label`  | `margin: 0 8px 8px`、`padding: 0`；文字左偏移 8px、到下一项 9px，与改动前**完全一致**                                           |
| `.file-meta-item`   | `flex` / `column` / `row-gap: 4px` / `padding: 8px 12px`；两个 `Text` 宽 266px（292 − 24 padding − 2 border），截断正常         |
| `.sheet-footer`     | 同构节点：`padding: 8px 0`、文字距上边框 9px（1px 线 + 8px 内距）、底部留白 8px，与原 `padding: 8px 0` 一致                     |

`typecheck` / `lint`（含 stylelint）/ `format:check` / `build` 全部通过。

### 16.7 一个测试方法上的坑

第一次构造同构节点验证 `.sheet-footer` 时，把节点 append 到了 `<body>`，读出 `padding: 0px`，一度以为 `rt-r-py-2` 失效。

真实原因是 **`<body>` 在 `.radix-themes` 外面**——`--space-2` 定义在 `.radix-themes` 上，没继承到 body，于是 `padding-top: var(--space-2)` 解析失败变 0。

改挂到 `.radix-themes` 内部后立刻读出 `8px 0px`。

教训：**用 `getComputedStyle` 验证时必须先确认节点的上下文**。Radix 的尺度、颜色变量全部由 `.radix-themes` 提供，脱离了这棵树，所有 `var(--space-*)` / `var(--gray-*)` 都会静默失效。

## 17. 验证方式

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

### 已执行的机器验证

`typecheck` / `lint` / `format:check` / `build` 全部通过。此外用 Xvfb + Electron +
CDP（`--remote-debugging-port`）读取真实计算样式，逐项比对「props 化之后的实际值」与
「审计前 CSS 的生效值」，确认是像素级等价而不是「看起来差不多」：

| 元素                           | 计算样式（改后）                                                                                          | 审计前 CSS 生效值                | 结论          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------- |
| `.choice-cell`                 | `column-gap: 8px`、`padding: 7px 9px`、`min-width: 0`                                                     | 同                               | ✅            |
| `.choice-grid`                 | `gap: 6px`                                                                                                | `gap: 6px`（曾吃掉 prop 的 8px） | ✅ 冲突已消除 |
| `.stat`                        | `padding: 11px 13px`、`min-width: 0`                                                                      | 同                               | ✅            |
| 面板标题行                     | `padding: 18px 20px 0`、`gap: 16px`、`align-items: flex-start`                                            | 同                               | ✅            |
| `.field-label`                 | `column-gap: 7px`、`font-size: 12.5px`                                                                    | 同                               | ✅            |
| `.empty-state` / `.empty-icon` | **曾误记为 `padding: 34px 20px`，实际是 0**（见第 13 章）；`gap: 8px`、`42×42`、`margin-bottom: 2px` 属实 | —                                | ❌ 已修       |
| `.workbench-grid`              | `gap: 18px`、`align-items: flex-start`、`columns: 400px 570px`                                            | 同                               | ✅            |
| `.app-main`                    | `margin: 12px`、`display: flex`、`flex-direction: column`                                                 | 同                               | ✅            |
| `.sidebar-scroll`              | `flex-grow: 1`、`min-height: 0`、高度 621px                                                               | 原 `.sidebar-nav` 同几何         | ✅            |
| 页面内裸 `div`（无 class）     | 0 个                                                                                                      | —                                | ✅            |

第二轮（Card / Badge 重构）同样是「改造前先采集、改造后逐项比对」：

| 对象             | 改造前                                                   | 改造后                               | 结论                         |
| ---------------- | -------------------------------------------------------- | ------------------------------------ | ---------------------------- |
| `.panel`         | 高 685.36、内容内缩 1px（border 占位）                   | 高 683.36、内缩 0                    | 差 2px / 1px，仅描边不再占位 |
| `.settings-card` | 高 159、圆角 10px                                        | 高 157、圆角 10px                    | 同上                         |
| 面板标题行       | `padding: 18px 20px 0`、`gap: 16px`、`align: flex-start` | 同（宽度 398 → 400）                 | ✅ 只有 1px 位移             |
| `.share-badge`   | 高 16.25、圆角 3px、`gray-9` / `accent-11` / `red-11`    | 高 16.25、圆角 3px、渲染色完全相同   | ✅，宽度差 <1px              |
| 卡片外观         | `background` + `border` + `border-radius` + `box-shadow` | 全部由 `Card` 提供，CSS 只剩两个取值 | ✅                           |

页面截图（1280×800）已核对：EL 扫描页、Excel 解析页、设置页，三页布局、间距、
分隔线与改动前一致；侧边栏 footer 的 12px 内边距、导航滚动区、Radix overlay 滚动条均正常。

### 需要人工过的点

1. 四个扫描页：范围面板标题行、机台选择格（6px）、统计四宫格、进度区、各机台结果表。
2. 复制面板：目标目录行、机台三列网格、按钮栏。
3. 历史记录：展开后工具栏与行的内边距。
4. 设置页：分区标题与白卡间距、更新分区的底部区域。
5. 侧边栏：导航区可滚动、footer 固定、滚动条为 Radix overlay 样式（唯一有意变化）。
6. 机台列表的共享徽标：沙箱里没有机台数据，徽标是用注入 DOM 的方式量的，真机需看一眼三态颜色。
