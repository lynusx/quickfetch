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
- 组件样式与组件布局文件同目录（如 `components/Panel.tsx` + `Panel.css`、`features/scan/scan.css`）；全局基线、令牌、共享工具类与 sonner 覆盖在 `src/renderer/index.css`。不要新建 `styles/app.css` 之类的汇总文件
- 组件统一从 `@radix-ui/themes` 导入（如 `Button`, `Flex`, `Grid`, `Box`, `Text`, `Heading`, `Card`, `Badge`, `Dialog`, `Callout`, `Progress`, `Table` 等）
- 图标统一使用 `@radix-ui/react-icons`
- 禁止混用其他组件库与全局 CSS reset；自定义颜色使用 Radix 设计令牌（如 `var(--accent-9)`、`var(--gray-3)`）
- 类别勾选统一使用基于 Radix Themes 原生组件的 `ChoiceList`（多选）与 `ChoiceRadio`（单选）

## 这个项目的几条硬约束

**架构**：Electron 三进程，IPC 契约全部集中在 `src/shared/ipc.ts`。新增通道三处一起改：
`src/shared/ipc.ts` 定类型 → `src/main/ipc/<域>.ipc.ts` 注册（入口 `src/main/ipc/index.ts`
聚合）→ `src/preload/index.ts` 暴露，漏一处就断链。

**配置落盘**：只走 `src/main/services/settings/settings.ts` 写 `userData/settings.json`，不要在渲染层用 `localStorage`
存业务配置——主进程扫描时读的是磁盘，两边会不一致。写文件是「临时文件 + rename」的原子写，别改成直接写。
例外是纯界面偏好（类型清单、上次勾选的类型）：这些只影响筛选面板长什么样，扫描参数仍随 IPC 传给主进程，
所以走 `userPreferencesStore` / 各 `filterStore` 的 `persist`。**类型清单一律默认空**，不替用户预设
（现场命名差异大，猜错一次就得先删），谁用谁加。

**userData 目录名是 `shx-tools`，不是 `SHX Tools`**：Electron 启动时由 `LoadAppPackage()` 读
`app.asar/package.json` 的 `productName`，没有则退回 `name`（本项目为 `shx-tools`），再 `SetName()`。
`electron-builder.yml` 的 `productName: SHX Tools` 只影响 exe 名、快捷方式、窗口标题，不参与目录命名。
Windows 上实际位置是 `%APPDATA%\shx-tools\`，**和开发态是同一个目录**，同一台机器调试会碰到现场配置。
想改用 `SHX Tools`，得往项目 `package.json` 加 `productName` 字段——那会让老用户的历史与设置"消失"，
必须同时写迁移。

**环境变量优先级**：`环境变量 > 设置页 > 默认值`，实现在 `src/main/services/settings/load.ts` 的 `loadFrom()`。
被环境变量接管的项，设置页会把输入框标灰（`AppSettings.envOverrides`）。加新档位时这个字段要同步。

**网络错误判定**：只有 `src/main/services/scanner/fsx.ts` 里 `NETWORK_CODES` 列出的错误码才算「不可达」，其余一律按
「目录不可用」处理。断网熔断全靠这个判定，把路径问题算成断网会直接暂停整个任务并提示
「请接专用内网」，现场极难查。同理，探测第二层目录（力禧特的共享名、利珀的标识目录）
不要读 `\\IP` 这种只有主机的 UNC 根——Windows 枚举它会返回 EINVAL/ERROR_BAD_NETPATH，
跟断网的表现一模一样，要按已知候选名直接读子目录。

**扫描历史是三类页面的公共能力**：EL / 力禧特 / 利珀都必须挂 `HistoryPanel`，
三处共用 `hooks/useHistoryRestore` 回填参数与载入快照。当前任务快照只存在内存里，
重启后为空，历史是唯一的恢复入口——少挂一个页面，那一类扫描的结果就等于「扫完就没了」。
新增扫描类别时先确认这一点。

**退出前抢救未完成任务**：`src/main/index.ts` 的 `before-quit` 会拦住退出，调
`src/main/services/scanner/registry.ts` 的 `persistUnfinished()`，把还在跑的任务按 `interrupted`
状态写进历史（最多等 3 秒）。现场扫几分钟后直接关窗口很常见，不救的话已经读到的
几千张图会随进程消失。`saveRecord(task, images, { interrupted: true })` 是这条路径的入口，
平时不传这个参数——正常结束的任务只认 completed / canceled / failed 三种终态。

**版本号**：`fix:` 递增 patch，`feat:` 递增 minor，`!` 或 `BREAKING CHANGE` 递增 major。
这套逻辑在 `.husky/commit-msg` + `scripts/auto-version.cjs`，`post-commit` 负责把版本号 amend 进同一个提交。
**不要手动改 `package.json` 的 version，也不要再补 `chore(release)` 提交。**

钩子只挂在 `git commit` 上，所以**长期不提交、攒着一大批改动再打包**时，版本号不会自己动——
这不是钩子坏了。例外情况只有一种：用户要求在未提交状态下先出包，此时手工把 version 提到目标值，
并在那笔提交上加 `SKIP_VERSION=1`（否则钩子会在手工版本上再加一级，跟已经发出去的包对不上）：

```bash
SKIP_VERSION=1 git commit -m "feat(pl): 利珀扫描入口"
```

提交前确认 `package.json` 没有未暂存改动（`git diff -- package.json` 为空）。`commit-msg` 写版本号后，
`post-commit` 会 `git add package.json` 并 amend；若工作区本来就有未暂存的 package.json 改动，
会被一起带进本次提交。`SKIP_VERSION=1` 也要先把 package.json 完整 `git add`。

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

打包前先清 `release/`，打完把 zip 拷到工作区根目录（要先把根目录里的旧 zip 删掉）。
截图同理：`shots/` 里只保留最近一次，新一轮截图前先清空，否则会慢慢堆出几十张过期图，
用户分不清哪张是当前界面。

```bash
rm -rf release/* && pnpm dist:win                 # 打包
rm -f /workspace/SHX-Tools-*.zip                  # 删旧包
cp release/SHX-Tools-*-portable.zip /workspace/   # 只留这一份
rm -f /workspace/shots/*                          # 拍截图前清空
```

`.claude/` 是第三方 skill 文档与本文档所在位置，已加进 `.prettierignore`。跑 `format:fix` 前请确认它还在忽略列表里，
否则会把别人的文档整篇重排，混进 diff 里。
