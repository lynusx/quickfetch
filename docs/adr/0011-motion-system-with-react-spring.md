# ADR 0011: 基于 react-spring 的统一动效系统

- **状态**：已采纳
- **日期**：2026-11-25

## 背景

在 ADR 0010 为扫描结果表引入 `@react-spring/web` 行插入动画后，应用其余关键交互仍处于「无过渡硬切」或「单向 CSS 动画」状态：

- `Drawer`（当前用于扫描历史抽屉）仅用 CSS `@keyframes` 做了打开滑入，关闭时随 Radix `Dialog` 直接卸载而瞬间消失；
- `PlantScanPage` 的「扫描范围面板 ↔ 单行摘要条」以及 `ScanTaskPanel` 的「复制失败明细」采用条件渲染硬切，导致下方任务流瞬间跳动；
- 侧边栏路由切页直接替换 `<Outlet />`，视觉切换偏生硬；
- `prefers-reduced-motion` 检测与弹簧参数散落在局部组件中，容易在后续迭代中出现体感不一致。

## 决策

以 `@react-spring/web` 作为应用内组件级状态过渡的统一动效引擎，坚持「工具型桌面应用克制跟手、无多余回弹、尊重系统减动效偏好」的原则：

1. **统一动效预设与减动效订阅**（`src/renderer/lib/motion.ts`）：
   - 提供 `SPRING_SNAPPY`（`tension: 360, friction: 34, clamp: true`）与 `SPRING_GENTLE`（`tension: 280, friction: 30, clamp: true`）两档临界阻尼预设；
   - 提供基于 `useSyncExternalStore` 的 `useReducedMotion()` hook，订阅 `(prefers-reduced-motion: reduce)` 变化，开启时所有动效自动切为 `immediate: true`。
2. **共享高度折叠原语**（`src/renderer/components/collapse/collapse.tsx`）：
   - 封装 `<Collapse open unmountOnExit?>`，结合 `useSpring` 与 `ResizeObserver` 测量真实高度；
   - 展开静止态自动切回 `height: auto` 与 `overflow: visible`（避免裁切动态内容、阴影或焦点环）；收起态自动附加 `inert` 与 `aria-hidden`，阻止键盘焦点落入隐藏区域；
   - 应用于 `PlantScanPage` 的「扫描范围 ↔ 摘要条」（同一 `<Box>` 内互斥切换，避免外层 `Flex` 出现双倍 `gap`）与 `ScanTaskPanel` 的「复制失败明细」。
3. **抽屉双向弹簧滑入/滑出**（`src/renderer/components/drawer/drawer.tsx`）：
   - `Drawer` 通过内部 Context 向 `DrawerContent` 透传开关状态（兼容受控与非受控用法）；
   - `DrawerContent` 保持基于 Radix Themes `Dialog.Content`，利用 `forceMount` + `useTransition` + `animated(Dialog.Content)` 实现 `right` / `left` / `bottom` 三个方向的双向滑入滑出；
   - 关闭态遮罩设置 `pointer-events: none` 与同步淡出，不阻塞用户继续操作主界面。
4. **切页与吸底栏轻量进场**：
   - `AppLayout` 中的 `AnimatedOutlet` 在 `pathname` 变化时播放 `opacity: 0 → 1`、`y: 6 → 0` 的单向轻量进场（不叠加退场页，避免两套 `PageShell` 争抢滚动与吸顶布局）；
   - `ScanTaskPanel` 吸底复制栏采用 `useTransition` 驱动 `opacity` + `y` 进出场，不破坏 `position: sticky`；
   - 位移归零后统一还原 `transform: none`，避免给后代 `fixed` / `sticky` 元素制造多余包含块。

## 备选方案与权衡

- **继续使用纯 CSS `@keyframes` / `transition`**：无法支持 Radix `Dialog` 卸载前的退场动画，也难以在不写死 `max-height` 的前提下做自适应高度折叠。
- **把侧边栏也迁到 `react-spring`**：侧边栏已有稳定轻量的 CSS 宽度过渡，强行迁移收益低且改动面大，保持现状。
- **使用 `useTransition` 做页面交叉淡入淡出**：需要绝对定位叠放两套带独立 `ScrollArea` 的 `PageShell`，容易引发滚动条闪动与状态冲突，不符合高频切页的工具效率诉求。

## 后果

- 新增动效统一从 `@/lib/motion` 取预设与 `useReducedMotion()`，不再手写散落的 `tension`/`friction` 或 `matchMedia`；
- 凡涉及展开/折叠的区块优先复用 `<Collapse>`；
- `animated(...)` 传入 `SpringValue` 作为 `react-spring` 的唯一合理内联 `style` 例外，其余静态布局与样式仍严格遵守 Radix Themes props 优先原则。
