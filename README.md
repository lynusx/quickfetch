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
│   ├── settings.ts       # 根目录、机台列表与设置页偏好的持久化（userData/settings.json）
│   ├── load.ts           # 并发与分批档位的最终取值（环境变量 > 设置页 > 默认值）
│   ├── historyLimit.ts   # （在 shared/ 下）历史保留条数的默认值与边界收敛
│   ├── copy.ts           # 平铺复制 + source.txt + 同名自动改名（分批推进）
│   └── scanner/          # 扫描任务
│       ├── index.ts      # 对外导出
│       ├── task.ts       # 任务执行体：前缀探测 → 展开 → 收图，含暂停/取消/进度
│       ├── registry.ts   # 任务表、快照广播、历史淘汰
│       ├── fsx.ts        # 带超时的 readdir，区分不存在/无权限/不可达
│       ├── history.ts    # 历史结果落盘、裁剪、按 id 读取
│       └── limiter.ts    # 并发闸门，支持运行时降档
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

## 资源占用

现场电脑为 8G 内存 + 256G 盘，图片根目录在共享盘上，所以读取强度是刻意压低的：

| 项 | 默认值 | 说明 |
| --- | --- | --- |
| 目录读取并发 | 4 | 每个并发约占一个句柄 + 一条 SMB 请求 |
| 机台分批 | 2 | 一批机台跑完再开下一批，内存峰值只与单批相关 |
| 复制并发 | 6 | Windows 上共享冲突高发，不宜再高 |
| 复制分批 | 50 张 | 批之间让出事件循环，进度也可按批反馈 |

改档位在应用侧边栏底部的**设置页**里调，落盘到 `settings.json`，不必重新打包。
临时压降仍可用环境变量 `SHX_READ_CONCURRENCY`、`SHX_MACHINE_BATCH`、
`SHX_COPY_CONCURRENCY`、`SHX_COPY_BATCH`——**环境变量优先于设置页**，
被接管的项在设置页会标出变量名并禁用输入。

三条硬约束：

- **并发闸门不可嵌套**。已占用名额的任务里不要再 `limiter(...)` 调用自己，
  并发降到 1 时会死锁。所以第 5 层是「先并发读、再串行处理结果」两步走，
  机台层也不再包一层 limiter。
- **探测与收尾共用同一个闸门**，总并发不会叠加。探测只拿目录名（几 MB），
  文件明细统一在 `collectDetails` 补读，避免几万张图的路径同时驻留内存。
- **失败率自适应降档**：每 20 次读取统计一次，不可达超过 25% 就降一档（下限 1），
  单次超时同步从 20 秒收紧到 8 秒。只降不升——反复试探只会让吃紧的机器更抖。

## 历史记录

每次扫描结束（完成 / 取消 / 失败）后，主进程把结果写入
`userData/history/<taskId>.json`，默认保留最近 **10 条**，可在界面上调整（1–50）。

- **存全量图片路径**，不是内存快照里的 200 条预览。历史任务要能再次复制，
  只存预览会让 200 条之后的结果静默消失。
- **落盘在任务真正结束后触发**：`cancel()` 是立即返回 `canceled` 的，
  执行体还要走几个检查点才退出，`runner.waitSettled()` 保证不会把取消瞬间的
  中间结果写成最终结果。
- **原子写**（temp + rename），扫描完成时如果正好休眠或断电，不会留下半截 JSON。
- **裁剪只删最旧的**：改小保留条数后立即裁剪，改大不会找回已删的记录。
- **列表只带摘要**，不带 `branches` 与图片；点开某条才按 id 加载完整结果。
- **恢复历史会把参数回填到筛选面板**（机台、日期、班次、时段、类型、厂区），
  避免出现「界面显示今天白班、结果却是上周夜班」的错位。
- 单个历史文件损坏只跳过该条，不影响列表。
