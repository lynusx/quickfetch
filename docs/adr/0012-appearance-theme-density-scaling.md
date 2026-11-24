# ADR 0012: 外观系统（明暗主题、界面密度与界面缩放）

## 状态

已采纳（2026-11-25）

## 背景

此前 QuickFetch 在 `src/renderer/App.tsx` 中将 `<Theme appearance="light">` 与 Sonner `<Toaster theme="light">` 固定为浅色，主进程 `src/main/index.ts` 也写死了浅色启动底色与 Windows 顶栏按钮颜色，且缺乏界面密度与界面缩放调节能力。参考 cc-switch 的设置页设计，需要在设置页新增「外观」分组，提供 **明暗（跟随系统 / 浅色 / 深色）**、**界面密度（紧凑 / 舒适）**、**界面缩放（90% / 100% / 110% / 125%）** 三项持久化配置并全链路生效。

## 决策

### 1. 明暗主题：主进程与渲染层双向同步

- 偏好落盘于 `settings.json` 的 `preferences.appearance`（`'system' | 'light' | 'dark'`，默认 `'system'`）。
- **主进程**（`src/main/services/appearance.ts`）：启动期与保存偏好时同步 `nativeTheme.themeSource`，并监听 `nativeTheme.on('updated')` 自动刷新全部 `BrowserWindow` 的 `backgroundColor` 与 Windows `titleBarOverlay.symbolColor`，避免深色模式下启动闪白或右上角系统按钮不可见。
- **渲染层**（`src/renderer/lib/appearance.ts`）：通过 `useSyncExternalStore` 订阅 `prefers-color-scheme: dark`，向 `<Theme appearance>`、Sonner `<Toaster theme>` 与 `document.documentElement.style.colorScheme` 下发解析后的 `'light' | 'dark'`，保证所有 Radix 组件、Toast 与原生滚动条/日期控件一致。

### 2. 界面密度：全局间距令牌收紧（与缩放正交）

- 偏好落盘于 `preferences.density`（`'compact' | 'comfortable'`，默认 `'comfortable'`）。
- 渲染层将 `data-density` 挂在 `<html>` 根节点上，通过 `:root[data-density='compact'] .radix-themes` 统一收紧 Radix `--space-1` 至 `--space-9` 阶梯（约 `0.75–0.8x`）以及 `--app-page-header-height` / `--app-settings-row-min-height`，**不改变字号**。
- 挂在 `:root` 而非仅挂在应用内层容器，确保 Radix Portal 渲染的抽屉、弹窗与说明卡也能共享同一密度。

### 3. 界面缩放：使用 Electron `setZoomFactor` + 顶栏高度补偿

- 偏好落盘于 `preferences.scale`（`90 | 100 | 110 | 125`，默认 `100`）。
- `@radix-ui/themes` 的 `<Theme scaling>` 最高仅支持 `110%`，无法满足 `125%` 档位；改由主进程调用 `webContents.setZoomFactor(scale / 100)`，实现四档完整等比无损缩放，并在 `did-finish-load` 时补同步，防止首次导航重置缩放。
- 由于 Windows `titleBarOverlay.height` 按固定 `40` DIP 绘制而不随 `zoomFactor` 缩放，渲染层将倍率同步至 `--app-zoom`，并以 `--app-topbar-height: calc(40px / var(--app-zoom))` 反向补偿，使顶带拖拽区与模态遮罩上沿在任意缩放档位下均与系统窗口按钮严格对齐。

## 取舍与后果

- **收益**：
  - 现有渲染层 CSS 全部使用 Radix 语义变量，零硬编码颜色，深色模式开箱即用且无维护负担。
  - 「界面密度」只调间距、「界面缩放」等比缩放全局，两者语义正交、组合使用不冲突。
  - `setZoomFactor` 原生支持 `125%` 及图标/表格/文字的统一缩放，无需重写 Radix 内部样式。
- **代价**：
  - 主进程 `appearance.ts` 需保留浅/深两套窗口底色与顶栏符号色常量，与 Radix `slate` 的 `--gray-2` / `--gray-12` 保持对应。
  - 缩放倍率变化时需保持 `--app-zoom` 与主进程 `zoomFactor` 一致（同源驱动自 `preferences.scale`）。
