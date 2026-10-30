# SHX Tools

RCA EL 图片拷贝与 Excel 解析工具，基于 Electron + React 的桌面应用（Windows x64）。

## 使用需知

- 图片拷贝要求目标机器上存在名为 `DC` 的根目录，目录层级为：
  `DC/<机台>/EL/<日期 YYYYMMDD>/<班次>/<时段>/<类型>/<图片>`
- 根目录只需配置一次，会持久化到用户数据目录（Windows 为 `%APPDATA%/shx-tools/settings.json`），
  再次打开直接复用；配置时自动识别 `DC` 下的机台目录，首字母 `A` 归东区、`B` 归西区
- 支持扩展名：`.png` `.jpg` `.jpeg` `.webp` `.gif`
- 扫描在主进程用 `fs.readdir` 完成（不再受浏览器 File System Access API 限制），分三段执行：
  探前缀（机台 → EL → 日期 → 班次）→ 列真实时段与类型后取交集 → 只对命中的类型目录收图。
  父级缺失的分支整段跳过，不发无效请求
- 任务状态：待开始 / 进行中 / 已暂停 / 已完成 / 已取消 / 失败。暂停可断点续跑；
  连续 5 个目录不可达会自动暂停并提示网络中断
- 扫描结果会写入目标目录的 `source.txt`（相对路径清单），图片按文件名平铺拷贝；
  遇到同名文件自动改名为 `name (2).jpg`，不覆盖已有文件

## 开发

```bash
pnpm install
pnpm dev      # electron-vite 起渲染层 dev server 并拉起 Electron
pnpm typecheck
pnpm format:fix
```

> 若启动报 `Electron uninstall`，说明依赖的安装脚本被 pnpm 跳过；
> `pnpm dev` 会通过 `scripts/ensure-electron.cjs` 自动补下载。

## 构建与打包

```bash
pnpm build                    # 产物输出到 out/（main、preload、renderer）
pnpm dist:win                 # 在 out/ 基础上打 Windows x64 NSIS 安装包，输出到 release/
```

打包配置见 `electron-builder.yml`，应用图标为 `build/icon.png`（占位图，可替换为正式 256×256 图标）。

## 目录结构

```
src/
├── main/                 # 主进程
│   ├── index.ts          # 窗口创建、应用生命周期
│   ├── ipc.ts            # IPC 注册（配置/任务/复制/另存 Excel）
│   ├── settings.ts       # 根目录与机台列表的持久化（userData/settings.json）
│   ├── copy.ts           # 平铺复制 + source.txt + 同名自动改名
│   └── scanner/          # 扫描任务
│       ├── index.ts      # 对外导出
│       ├── task.ts       # 任务执行体：前缀探测 → 展开 → 收图，含暂停/取消/进度
│       ├── registry.ts   # 任务表、快照广播、历史淘汰
│       ├── fsx.ts        # 带超时的 readdir，区分不存在/无权限/不可达
│       └── limiter.ts    # 目录读取并发闸门
├── preload/index.ts      # contextBridge 暴露 window.electronAPI
├── shared/ipc.ts         # 主进程 ↔ preload ↔ 渲染层共用的 IPC 类型契约
└── renderer/             # 渲染层（React）
    ├── index.html
    ├── main.tsx          # HashRouter 挂载
    ├── App.tsx           # 路由表 + Toaster / TooltipProvider
    ├── pages/            # 页面（图片拷贝、Excel 解析、布局）
    ├── components/       # 业务组件（根目录与机台选择、参数面板）
    │   └── ui/           # shadcn/ui 组件（CLI 生成，勿手改样式约定）
    ├── hooks/            # 业务逻辑（任务生命周期、复制）
    ├── stores/           # zustand 状态（配置、任务快照、筛选参数）
    ├── lib/utils.ts      # cn()
    ├── utils/            # 通用工具
    ├── types/            # 渲染层类型（Excel 等）
    ├── index.css         # Tailwind 入口 + shadcn 主题变量
    └── public/img/       # 静态资源
```

构建产物：`out/main`、`out/preload`、`out/renderer`；安装包输出到 `release/`。

## UI 约定

- 组件库：**shadcn/ui**（radix base，vega 预设），配置见 `components.json`
- 样式：**Tailwind CSS v4**，通过 `@tailwindcss/vite` 接入；设计令牌集中在 `src/renderer/index.css`
- 别名：`@/*` → `src/renderer/*`（`tsconfig*.json` 与 `electron.vite.config.ts` 同步配置）
- 图标：`lucide-react`；提示：`sonner`；`cn()` 由 `cn` 包提供
- 新增组件：`npx shadcn@latest add <component>`（`init` 需要根目录有 `vite.config.ts` 才能通过框架探测，`add` 不需要）

## 架构约定

- 渲染层不做任何文件系统操作，全部经 `window.electronAPI` 走 IPC，由主进程用 `node:fs` 执行
- 配置（根目录、机台列表）只有主进程一份，落盘在 `userData/settings.json`；渲染层只持有镜像
- 扫描结果全量留在主进程，按 `taskId` 引用；渲染层只接收统计与前 200 条预览，
  复制时传 `taskId` 让主进程取全量，避免上万条路径在 IPC 上来回搬
- 主进程/preload 打包为 CommonJS（`.cjs`），渲染层为 ESM；仓库本身是 `type: module`
- 路由使用 `HashRouter`：生产环境通过 `file://` 加载，history 路由会 404
