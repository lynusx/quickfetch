# AGENTS.md

给接手这个项目的 AI 助手看的说明。人也可以看，但内容偏向「做之前先读什么」。

根目录 [`AGENTS.md`](../AGENTS.md) 是原则、入口与高风险速查；本文件是可执行的详细约束。

## 先读这些

| 场景                      | 该读什么                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| 要动 UI、加组件、调整样式 | [`skills/radix-themes/SKILL.md`](skills/radix-themes/SKILL.md)     |
| 整体怎么跑起来            | [`README.md`](../README.md)                                        |

## Radix Themes (@radix-ui/themes) 相关改动

项目统一使用 `@radix-ui/themes` 构建 UI，根节点由 `<Theme>` 包裹，已彻底移除 shadcn/ui 及 Tailwind CSS。

- 样式文件：`@radix-ui/themes/styles.css`
- 每个共享组件一个目录；渲染层组件目录名、组件文件与样式文件统一 kebab-case（如 `components/panel/panel.tsx` + `components/panel/panel.css`、`layouts/app-layout.tsx`）；`index.ts` 只做多组件导出，不放组件实现。全局基线、令牌、共享工具类与 sonner 覆盖在 `src/renderer/index.css`。不要新建 `styles/app.css` 之类的汇总文件
- 组件统一从 `@radix-ui/themes` 导入（如 `Button`, `Flex`, `Grid`, `Box`, `Text`, `Heading`, `Card`, `Badge`, `Dialog`, `Callout`, `Progress`, `Table` 等）
- 图标统一使用 `@radix-ui/react-icons`
- 禁止混用其他组件库与全局 CSS reset；自定义颜色使用 Radix 设计令牌（如 `var(--accent-9)`、`var(--gray-3)`）
- 类别勾选统一使用基于 Radix Themes 原生组件的 `ChoiceList`（多选）与 `ChoiceRadio`（单选）

## 这个项目的几条硬约束

**架构**：Electron 三进程，IPC 契约全部集中在 `src/shared/ipc.ts`。新增通道的顺序是：
在 `ElectronAPI` 加方法 → 在 `IPC_INVOKE` 补通道（漏了会类型报错）→ 在
`src/main/ipc/<域>.ipc.ts` 用方法名 `handle('methodName')` 注册（入口 `src/main/ipc/index.ts`
聚合）。preload 的 invoke 方法由描述表自动生成，不要再手写通道字符串。事件通道加
`IPC_EVENTS`，send-only 通道加 `IPC_SEND`，两端都引用同一常量。`summarizeIpcArgs` 也按
方法名分支；`pnpm verify` 会比对 main 的注册与 `IPC_INVOKE` 是否一一对应。

**配置落盘**：只走 `src/main/services/settings/settings.ts` 写 `userData/settings.json`，不要在渲染层用 `localStorage`
存业务配置——主进程扫描时读的是磁盘，两边会不一致。持久化内核（ENOENT 才回落、损坏留档、
原子写、读改写串行队列、残留 tmp 清理）在 `settings/store.ts` 的
`createSettingsStore({ file, fallback, isSupported, normalize })`，测试用临时目录；
`settings.ts` 只管领域字段、normalizer 与 mutator。
例外是纯界面偏好（类型清单、上次勾选的类型）：这些只影响筛选面板长什么样，扫描参数仍随 IPC 传给主进程，
所以走 `userPreferencesStore` / 各 `filterStore` 的 `persist`。**类型清单一律默认空**，不替用户预设
（现场命名差异大，猜错一次就得先删），谁用谁加。

**持久化失败语义**：`readSettings` 只有 `ENOENT` 才能回落默认值，权限/占用等读取错误必须抛出，
否则后续写入会把现场配置覆盖成默认值；损坏 JSON 会留档为 `settings.json.corrupt-*`。
渲染层偏好写入只合并本次 patch、失败只回滚本次字段，不要恢复整份旧快照。
历史列表读 `<id>.json.summary.json`，完整记录只在恢复/复制时读；导出文件同样用 temp + rename。

**userData 目录名是 `QuickFetch`**：Electron 启动时由 `LoadAppPackage()` 读
`app.asar/package.json` 的 `productName`（本项目已显式设为 `QuickFetch`），没有才退回 `name`。
`electron-builder.yml` 的 `productName: QuickFetch` 只影响 exe 名、快捷方式、窗口标题，不参与目录命名。
Windows 上实际位置是 `%APPDATA%\QuickFetch\`，**和开发态是同一个目录**，同一台机器调试会碰到现场配置。
项目尚未正式投入使用，改名不需要兼容旧 userData 目录。

**环境变量优先级**：`环境变量 > 设置页 > 默认值`，实现在 `src/main/services/settings/load.ts` 的 `loadFrom()`。
被环境变量接管的项，设置页会把输入框标灰（`AppSettings.envOverrides`）。加新档位时这个字段要同步。

**网络错误判定**：只有 `src/main/services/scanner/fsx.ts` 里 `NETWORK_CODES` 列出的错误码才算「不可达」，其余一律按
「目录不可用」处理。断网熔断全靠这个判定，把路径问题算成断网会直接暂停整个任务并提示
「请接专用内网」，现场极难查。同理，探测第二层目录（力禧特EL的共享名、利珀PL的标识目录）
不要读 `\\IP` 这种只有主机的 UNC 根——Windows 枚举它会返回 EINVAL/ERROR_BAD_NETPATH，
跟断网的表现一模一样，要按已知候选名直接读子目录。森标 AOI 的第二层按图片类型二选一
（`SaveImages` 整张扫描图 / `SaveSmallImages` 局部裁图），不需要探测，但仍必须读
`\\IP\{SaveImages|SaveSmallImages}` 而不是 `\\IP`。

**诊断、探测与页面派生各有唯一落点**：目录读取失败的状态 → 原因 → 文案 → 断网样本只在
`src/main/services/scanner/diagnosis.ts`；LXT/PL 的共享名两步读取、30 天日期窗口与网络重试只在
`src/main/services/scanner/shareProbe.ts`。渲染层的 ready/missing/参数指纹、历史回填、
按 catalog/入口裁剪与类别差异只在 `features/scan/scanScopePlan.ts`（纯规则）+
`scanScope.ts`（接 store）；`usePlantScanPage` 只订阅 store；扫描页的 scan/copy/history 接线走
`useScanSession`；复制的 done/percent/有效目录走 `copyReadModel`；任务容量与淘汰走
`src/main/utils/taskTable.ts`。扫描结果的落盘资格、幂等、裁剪与 live-vs-历史查找只在
`src/main/services/scanner/archive.ts`；文件格式与原子写留在 `history.ts` 的
`createHistoryStore(dir)`（目录由调用方注入，测试不要依赖 app userData）。
扫描进度计数器（leaf / 机台 / 明细）与 percent、phase、ETA 只在
`src/main/services/scanner/ledger.ts`，runner 只发事件，不要在各分支里手改计数器。
改这些规则时改对应 module，不要在 resolver、页面或 registry 里再抄一份。

**任务生命周期只有一个实现**：状态、暂停等待、中断信号、终态 promise、进度节流与心跳统一在
`src/main/utils/taskLifecycle.ts`。扫描与复制只提供自己的业务状态与快照；`begin()` 每轮重建终态
promise 与 abort 信号，复制 retry 依赖这条规则。不要在 runner 里再手写 `paused` / `resumeWaiters`
/ `settled` / ticker。

**扫描历史是四类页面的公共能力**：EL / 力禧特EL / 利珀PL / 森标 AOI 都必须挂 `HistoryPanel`，
四处共用 `hooks/useHistoryRestore` 回填参数与载入快照。当前任务快照只存在内存里，
重启后为空，历史是唯一的恢复入口——少挂一个页面，那一类扫描的结果就等于「扫完就没了」。
新增扫描类别时先确认这一点。

**退出前抢救未完成任务**：`src/main/index.ts` 的 `before-quit` 会拦住退出，调
`src/main/services/scanner/registry.ts` 的 `persistUnfinished()`，把还在跑的任务按 `interrupted`
状态写进历史（最多等 3 秒）。现场扫几分钟后直接关窗口很常见，不救的话已经读到的
几千张图会随进程消失。`saveRecord(task, images, { interrupted: true })` 是这条路径的入口，
平时不传这个参数——正常结束的任务只认 completed / canceled / failed 三种终态。

**调试日志只走 `src/main/services/log/`**：默认关闭，设置页开关实时生效；日志写在
`userData/logs/quickfetch-YYYY-MM-DD.log`，按天分文件保留 7 天，零运行时依赖。业务代码里不要再
直接 `appendFile` 或另起一套日志；热点路径（逐目录/逐文件）用函数型 fields，关闭日志时不会
执行对象构造。不要记录图片内容、Excel 字节或每帧进度快照。

**版本号**：`fix:` 递增 patch，`feat:` 递增 minor，`!` 或 `BREAKING CHANGE` 递增 major。
这套逻辑在 `.husky/commit-msg` + `scripts/auto-version.cjs`，`post-commit` 负责把版本号 amend 进同一个提交。
**不要手动改 `package.json` 的 version，也不要再补 `chore(release)` 提交。**

钩子只挂在 `git commit` 上，所以**长期不提交、攒着一大批改动再打包**时，版本号不会自己动——
这不是钩子坏了。例外情况只有一种：用户要求在未提交状态下先出包，此时手工把 version 提到目标值，
并在那笔提交上加 `SKIP_VERSION=1`（否则钩子会在手工版本上再加一级，跟已经发出去的包对不上）：

```bash
SKIP_VERSION=1 git commit -m "feat(pl): 利珀PL扫描入口"
```

提交前确认 `package.json` 没有未暂存改动（`git diff -- package.json` 为空）。`commit-msg` 写版本号后，
`post-commit` 会 `git add package.json` 并 amend；若工作区本来就有未暂存的 package.json 改动，
会被一起带进本次提交。`SKIP_VERSION=1` 也要先把 package.json 完整 `git add`。

**发布一致性**：`pnpm dist:win` 会先跑 `scripts/check-release.cjs`——`version` 必须与 `HEAD` 的
`package.json` 一致、工作区干净（含未跟踪文件），merge/rebase/cherry-pick/revert 进行中直接拒绝。
`SKIP_RELEASE_CHECK=1` 只用于「明确要求未提交出包」，跳过 Git 检查但不跳过版本格式校验。
侧边栏版本经 `useAppVersion` 调 `app:version` 运行时读取，不要再注入 `VITE_APP_VERSION`
或在渲染层复制版本号。推送 `vX.Y.Z` tag 即触发 `.github/workflows/release.yml`：校验 tag
与版本一致、提交在 `main` 上，跑检查、打包并创建 GitHub Release。具体命令见 README「构建与打包」。

**自动更新**：安装版走 electron-updater，免安装 zip 只提示手动替换。唯一落点在
`src/main/services/update/`，不要在 registry、页面或 IPC 层直接调 `autoUpdater`。
`electron-updater` 必须留在 `dependencies`（externalizeDepsPlugin 只外置生产依赖，
electron-builder 会单独收集进 asar），不要移到 devDependencies 或打进 bundle。
安装方式靠安装目录里的 `Uninstall QuickFetch.exe` 判断；找不到时按免安装处理，宁可不装。
安装/重启前必须过 `getTaskBlock()`：running/paused 扫描与 pending/running/paused 复制都会阻塞；
安装前要等 `flushScanPersistence()` 与 `flushSettingsWrites()`，`before-quit` 通过
`isInstallingUpdate()` 旁路现有 preventDefault，避免安装被拖住。
发版资产固定为 exe、exe.blockmap、latest.yml、zip 四项；electron-updater 锁定 6.8.11，
升级前重新验证未签名场景与 app-update.yml 的 `publisherName` 行为。

**提交信息**：Conventional Commits，由 commitlint 校验，格式 `type(scope): 描述`。

**不要把 Claude Code 加为贡献者**：提交信息里不要出现 `Co-Authored-By: Claude Code <noreply@anthropic.com>`
或任何等价的署名行；提交历史只保留仓库作者。

## 改完自检

```bash
pnpm typecheck                    # 类型
pnpm lint                         # ESLint
pnpm format:check                 # Prettier（写入用 pnpm format:fix）
pnpm build                        # 构建
```

四条全过再提交。UI 改动建议用截图确认，别只看编译通过。

## 打包与截图：每次只留最新一份

**不要每次改完就打包**，只在用户明确要求打包时执行。

打包前先清 `release/`，**产物留在 `release/` 里即可，不要拷到工作区根目录**。
截图同理：`shots/` 里只保留最近一次，新一轮截图前先清空，否则会慢慢堆出几十张过期图，
用户分不清哪张是当前界面。

```bash
rm -rf release/* && pnpm dist:win                 # 打包，产物在 release/
rm -f /workspace/shots/*                          # 拍截图前清空
```

`.claude/` 是第三方 skill 文档与本文档所在位置，已加进 `.prettierignore`。跑 `format:fix` 前请确认它还在忽略列表里，
否则会把别人的文档整篇重排，混进 diff 里。
