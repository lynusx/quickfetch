# SHX Tools

RCA EL、力禧特EL、利珀PL、森标 AOI 图片拷贝与 Excel 解析工具，基于 Electron + React 的桌面应用（Windows x64）。

## 使用需知

- 图片拷贝要求目标机器上存在名为 `DC` 的根目录，目录层级为：
  `DC/<机台>/EL/<日期 YYYYMMDD>/<班次>/<时段>/<类型>/<图片>`
- 森标 AOI 的路径为 `\\<机台地址>\SaveImages\<日期 YYYYMMDD>\<8.5|20.5>\<类型>\<图片>`；
  入口同样是「根目录 / 东区|西区 / .lnk」，白班对应 `8.5`、夜班对应 `20.5`，没有时段层
- 根目录只需配置一次，会持久化到用户数据目录，再次打开直接复用：
  `%APPDATA%\shx-tools\settings.json`。扫描历史同样落在同目录的 `history\` 下。
  配置时自动识别 `DC` 下的机台目录，首字母 `A` 归东区、`B` 归西区

  > 目录名取的是应用名，Electron 启动时读 `app.asar\package.json` 的 `productName`，
  > 没有该字段则退回 `name`（本项目为 `shx-tools`）。`electron-builder.yml` 里的
  > `productName: SHX Tools` 只决定 exe 文件名、快捷方式和窗口标题，**不参与**目录命名。
  > 因此打包版与开发态共用同一个目录，同一台机器上开发调试会读写到现场那份配置。

- 支持扩展名：`.png` `.jpg` `.jpeg` `.webp` `.gif`
- 扫描在主进程用 `fs.readdir` 完成（不再受浏览器 File System Access API 限制），分三段执行：
  探前缀（机台 → EL → 日期 → 班次）→ 列真实时段与类型后取交集 → 只对命中的类型目录收图。
  森标 AOI 没有时段层，班次目录下直接列类型。父级缺失的分支整段跳过，不发无效请求
- 任务状态：待开始 / 进行中 / 已暂停 / 已完成 / 已取消 / 已中断 / 失败。暂停可断点续跑；
  连续 5 个目录不可达会自动暂停并提示网络中断。`已中断` 只出现在历史记录里，
  是程序退出时抢救未完成任务的状态
- 扫描结果会写入目标目录的 `source.txt`（相对路径清单）；图片按所选分组方式落盘
  （默认按机台）。遇到同名文件自动编号（`img.jpg` → `img1.jpg` → `img2.jpg`），
  默认不覆盖已有文件，也可在复制面板选择跳过或覆盖

## 开发

Node.js >= 22.12.0（见 `engines` 与 `.nvmrc`），pnpm 10.12.3。

```bash
pnpm install
pnpm dev      # electron-vite 起渲染层 dev server 并拉起 Electron
pnpm typecheck
pnpm format:check   # 只检查；写入用 pnpm format:fix
```

> 若启动报 `Electron uninstall`，说明依赖的安装脚本被 pnpm 跳过；
> `pnpm dev` 会通过 `scripts/ensure-electron.cjs` 自动补下载。

## 常见问题排查

### `pnpm dev` 启动即退出，退出码 `2147483651`

现象：Vite 的 main / preload 都编译成功、dev server 也起来了，随后 Electron 静默退出，
终端只剩 `ELIFECYCLE Command failed with exit code 2147483651.`，没有窗口，
也看不到任何主进程日志。

`2147483651` 就是 `0x80000003`（`STATUS_BREAKPOINT`）。Electron 在**执行
`out/main/index.cjs` 之前**就崩了，所以业务代码里的日志一行都打不出来。最常见的原因是
项目目录的文件被标成了 **Low 完整性级别（Low Mandatory Level）**：Chromium 的沙箱初始化
需要正常的完整性级别，拿到 Low 会直接触发断点异常。

排查（Windows，在项目根目录执行）：

```powershell
# 正常应直接输出 v45.x.x；崩溃或没有输出说明 Electron 起不来
node_modules\electron\dist\electron.exe --version

# 只有加 --no-sandbox 才正常 → 确认是沙箱初始化失败（只用来定位，不要当修复）
node_modules\electron\dist\electron.exe --no-sandbox --version

# 出现 "Mandatory Label\Low Mandatory Level" 就是根因
icacls . | findstr Mandatory
```

修复：

```powershell
icacls . /setintegritylevel "(OI)(CI)Medium" /T /C
```

必须加 `/T`：只改项目根不够，`node_modules\electron\dist\electron.exe` 本身也得是
Medium。修完重新 `pnpm dev` 即可。从这种目录复制出来的其它副本（例如桌面上的
`shx-tools2`）会有同样的问题，要一起处理。

`pnpm dev` / `pnpm start` 都会先执行 `scripts/ensure-electron.cjs`，它现在会实际跑一次
`electron --version`，失败时直接打印上面的排查和修复命令；确认环境无误、需要临时跳过时设
`SHX_SKIP_ELECTRON_CHECK=1`。

> 这类 Low 完整性 ACL 不是 Windows 或 git 自己产生的，通常来自某个沙箱 / 受限运行工具，
> 或者用 `robocopy /COPYALL`、`xcopy /O`、7-Zip「还原文件安全信息」等保留 ACL 的方式搬过
> 目录。修复后又变回 Low，可以用 Process Monitor 过滤 `SetSecurity` 抓出改它的进程。

### macOS 上 Electron 启动失败

macOS 没有 Windows 的完整性级别机制，但同样可能在打开窗口前退出。按顺序排查：

```bash
# 架构：Apple Silicon 应输出 arm64，Intel 为 x86_64
file node_modules/electron/dist/Electron.app/Contents/MacOS/Electron

# 隔离属性：有输出说明被 Gatekeeper 标记
xattr -p com.apple.quarantine node_modules/electron/dist/Electron.app

# 签名校验
codesign --verify --deep --strict node_modules/electron/dist/Electron.app

# 执行权限
ls -l node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
```

对应处理：

```bash
# 清除下载带来的隔离属性
xattr -dr com.apple.quarantine node_modules/electron/dist/Electron.app

# 开发环境可以 ad-hoc 重签
codesign --force --deep --sign - node_modules/electron/dist/Electron.app

# 补执行权限
chmod +x node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
```

- 进程被系统直接杀掉（shell 显示 `Killed: 9`、退出码 137）基本是签名或隔离属性问题
- `Bad CPU type in executable` 说明拉到的二进制架构和机器不一致，删除
  `node_modules/electron` 后重新 `pnpm install`
- 仍然起不来就看 Console.app 里 Electron 的报错

> macOS 只用于开发调试，打包产物只有 Windows 版（`pnpm dist:win`）。

## 构建与打包

```bash
pnpm build                    # 产物输出到 out/（main、preload、renderer）
pnpm dist:win                 # 先 build，再打 Windows x64 zip 免安装包，输出到 release/
```

`pnpm start` 使用上一次 `pnpm build` 的产物预览；改完源码要先重新构建。

打包配置见 `electron-builder.yml`，应用图标为 `build/icon.png`（占位图，可替换为正式 256×256 图标）。

## 目录结构

```
src/
├── main/                 # 主进程（领域引擎内聚）
│   ├── index.ts          # 窗口创建、应用生命周期
│   ├── ipc/              # 按模块划分的 IPC 注册层（index.ts 聚合 settings/scan/copy/history/excel）
│   ├── services/         # 核心服务
│   │   ├── scanner/      # 扫描任务引擎（任务表、各类 resolver、探测、收图、历史落盘）
│   │   ├── copy/         # 复制任务引擎（平铺复制、命名冲突策略、任务表）
│   │   ├── discovery/    # 机台与快捷方式识别（LXT / PL / lnk / shortcuts）
│   │   └── settings/     # 配置管理与环境覆盖持久化（userData/settings.json）
│   └── utils/            # 通用工具（自适应并发采样、UNC 路径规范化）
├── preload/index.ts      # contextBridge 暴露 window.electronAPI
├── shared/               # 主进程 ↔ preload ↔ 渲染层共用的类型契约（ipc.ts, historyLimit.ts）
└── renderer/             # 渲染层（Feature-First 特性优先架构）
    ├── index.html
    ├── main.tsx          # 挂载入口（HashRouter）
    ├── app.tsx           # Radix <Theme> Provider + 全局 Toaster
    ├── routes/           # 路径常量与懒加载路由表（paths.ts、app-routes.tsx）
    ├── index.css         # 全局基线：Radix/font 导入、令牌、reset、共享工具类、sonner
    ├── layouts/          # 框架布局（app-layout、app-sidebar，样式与组件同目录）
    ├── features/         # 业务特性模块（高内聚，页面、组件、Hook、Store、样式在一起）
    │   ├── scan/         # 图片扫描（EL / 力禧特EL / 利珀PL / 森标 AOI 页面、组件与状态）
    │   ├── copy/         # 复制管理（copy-panel、useImageCopy、copyStore）
    │   ├── history/      # 历史记录（history-panel、historyStore）
    │   ├── excel/        # Excel 解析（上传、解析、筛选、表格与状态）
    │   └── settings/     # 应用设置（settings-page、settingsStore、userPreferencesStore）
    ├── components/       # 全局跨模块组件（每个组件一个目录：kebab-case 组件文件 + 同名 CSS）
    │   ├── choice-list/  # 基于 Radix Themes 的单选/多选组件
    │   └── date-picker/  # 基于 Radix Popover + react-day-picker 的日期选择
    ├── hooks/            # 全局 UI 辅助 Hook（useToast）
    ├── lib/utils.ts      # cn()
    ├── utils/            # 全局通用工具函数
    └── public/img/       # 静态资源
```

构建产物：`out/main`、`out/preload`、`out/renderer`；安装包输出到 `release/`。

## UI 约定

- 组件库：**Radix Themes**（`@radix-ui/themes`），根节点由 `<Theme>` 包裹
- 样式：`@radix-ui/themes/styles.css`，使用 Radix 设计令牌
- 字体：拉丁使用 `Public Sans Variable`，中文回退到系统字体（Windows 微软雅黑、macOS PingFang SC、Linux Noto Sans CJK）；不打包 CJK 字体。字体变量需同时覆盖 `:root` 与 `.radix-themes`，否则 Radix 组件会使用自己的默认栈
- 布局与文本优先使用 `Box` / `Flex` / `Grid` / `Text` / `Heading`；原生标签只保留语义必需的 `button`、`label`、`input`、`details` 等
- 设计层：全局令牌、reset、共享工具类与 sonner 覆盖在 `src/renderer/index.css`；组件 CSS 与组件同目录（渲染层组件目录、组件文件与样式统一 kebab-case），业务 feature CSS 在各自 feature 目录（如 `features/scan/scan.css`）。不引入 reset / 其它组件库
- 页面标题统一由 `components/page-header/page-header` 渲染，`AppLayout` 不再重复标题栏；扫描页的任务进度、统计与控制按钮统一放在 `features/scan/components/scan-task-panel`
- 选择类控件统一使用 `components/choice-list`（多选）与 `ChoiceRadio`（单选），整个单元格可点击
- 别名：`@/*` → `src/renderer/*`（`tsconfig*.json` 与 `electron.vite.config.ts` 同步配置）
- 图标：`@radix-ui/react-icons`；提示：`sonner`；`cn()` 为内部纯逻辑实现

## 架构约定

- 渲染层不做任何文件系统操作，全部经 `window.electronAPI` 走 IPC，由主进程用 `node:fs` 执行
- 配置（根目录、机台列表）只有主进程一份，落盘在 `userData/settings.json`；渲染层只持有镜像
- 扫描结果全量留在主进程，按 `taskId` 引用；渲染层只接收统计与前 200 条预览，
  复制时传 `taskId` 让主进程取全量，避免上万条路径在 IPC 上来回搬
- 主进程/preload 打包为 CommonJS（`.cjs`），渲染层为 ESM；仓库本身是 `type: module`
- 路由使用 `HashRouter`：生产环境通过 `file://` 加载，history 路由会 404

## 资源占用

现场电脑为 8G 内存 + 256G 盘，图片根目录在共享盘上，所以读取强度是刻意压低的：

| 项           | 默认值 | 说明                                         |
| ------------ | ------ | -------------------------------------------- |
| 目录读取并发 | 4      | 每个并发约占一个句柄 + 一条 SMB 请求         |
| 机台分批     | 2      | 一批机台跑完再开下一批，内存峰值只与单批相关 |
| 复制并发     | 6      | Windows 上共享冲突高发，不宜再高             |
| 复制分批     | 50 张  | 批之间让出事件循环，进度也可按批反馈         |

改档位在应用侧边栏底部的**设置页**里调，落盘到 `settings.json`，不必重新打包。
EL / 力禧特EL / 利珀PL / 森标 AOI 共用同一套设置，包括分组方式、重名策略与全部性能档位。
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

每次扫描结束（完成 / 取消 / 失败 / 退出时中断）后，主进程把结果写入
`userData/history/<taskId>.json`，默认保留最近 **10 条**，可在界面上调整（1–50）。
「0 张图但至少有一个分支真正探测过」的诊断记录也会保留，方便回看失败原因。

- **存全量图片路径**，不是内存快照里的 200 条预览。历史任务要能再次复制，
  只存预览会让 200 条之后的结果静默消失。
- **落盘在任务真正结束后触发**：`cancel()` 是立即返回 `canceled` 的，
  执行体还要走几个检查点才退出，`runner.waitSettled()` 保证不会把取消瞬间的
  中间结果写成最终结果。
- **原子写**（temp + rename），扫描完成时如果正好休眠或断电，不会留下半截 JSON。
- **裁剪只删最旧的**：改小保留条数后立即裁剪，改大不会找回已删的记录。
- **列表只带摘要**，不带 `branches` 与图片；点开某条才按 id 加载完整结果。
- **恢复历史会把参数回填到筛选面板**（机台、日期、班次、时段、类型、厂区；
  森标 AOI 没有时段），避免出现「界面显示今天白班、结果却是上周夜班」的错位。
- 单个历史文件损坏只跳过该条，不影响列表。
