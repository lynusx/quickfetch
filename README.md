# SHX Tools

RCA EL 图片拷贝与 Excel 解析工具，基于 Electron + React 的桌面应用（Windows x64）。

## 使用需知

- 图片拷贝要求目标机器上存在名为 `DC` 的根目录，目录层级为：
  `DC/<厂区子目录>/EL/<日期 YYYYMMDD>/<班次>/<时段>/<类型>/<图片>`
- 支持扩展名：`.png` `.jpg` `.jpeg` `.webp` `.gif`
- 扫描结果会写入目标目录的 `source.txt`（相对路径清单），图片按文件名平铺拷贝到目标目录

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
│   ├── ipc.ts            # 文件系统 IPC（选目录/扫描/拷贝/写文本/另存 Excel）
│   └── scan.ts           # 6 层目录规则扫描
├── preload/index.ts      # contextBridge 暴露 window.electronAPI
├── shared/ipc.ts         # 主进程 ↔ preload ↔ 渲染层共用的 IPC 类型契约
└── renderer/             # 渲染层（React）
    ├── index.html
    ├── main.tsx          # HashRouter + Radix Theme 挂载
    ├── App.tsx           # 路由表
    ├── pages/            # 页面（图片拷贝、Excel 解析、布局）
    ├── components/       # 可复用组件
    ├── hooks/            # 业务逻辑
    ├── stores/           # zustand 状态
    ├── utils/            # 通用工具
    ├── types/            # 渲染层类型（Excel 等）
    └── public/img/       # 静态资源
```

构建产物：`out/main`、`out/preload`、`out/renderer`；安装包输出到 `release/`。

## 架构约定

- 渲染层不做任何文件系统操作，全部经 `window.electronAPI` 走 IPC，由主进程用 `node:fs` 执行
- 主进程/preload 打包为 CommonJS（`.cjs`），渲染层为 ESM；仓库本身是 `type: module`
- 路由使用 `HashRouter`：生产环境通过 `file://` 加载，history 路由会 404
