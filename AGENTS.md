# AGENTS.md

给接手这个项目的 AI 助手看的说明。人也可以看，但内容偏向「做之前先读什么」。

## 先读这些

| 场景                      | 该读什么                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------- |
| 要动 UI、加组件、调整样式 | [`.agents/skills/shadcn/SKILL.md`](.agents/skills/shadcn/SKILL.md)                  |
| 只关心某类写法对错        | 同目录 `rules/` 下对应文件（styling / forms / composition / icons / base-vs-radix） |
| 不清楚 shadcn CLI 怎么用  | 同目录 `cli.md`、`registry.md`                                                      |
| 整体怎么跑起来            | [`README.md`](README.md)                                                            |

## shadcn/ui 相关改动

项目用 shadcn/ui，`components.json` 在仓库根目录。**写组件前先拿项目真实配置再动手，不要凭印象拼 API**：

```bash
npx shadcn@latest info --json
```

返回里有两个字段最容易踩：

- `base` 为 `radix`（不是 `base-ui`）。组合用法是 `asChild`，不是 `render`
- `iconLibrary` 为 `lucide`，图标从 `lucide-react` 引入

`.agents/skills/shadcn/` 是官方 skill 本体（12 个文件），装法见 `skills-lock.json`。
它依赖项目的 `components.json` 触发，**换了目录或删了 `components.json` 就会失效**。

> 注意：`.agents/skills/` 是通用约定目录，不是每个工具都会自动扫描。
> CodeBuddy 只读 `/root/.codebuddy/skills/`；在 CodeBuddy 里需要显式去读这几个文件，
> 而不是指望它被自动加载。

### 换主题 / 加组件时 CLI 会卡在框架识别

`shadcn apply` 与 `init` 在本仓库都会报 “could not detect a supported framework”——
它只认 next / vite / react-router / astro，Electron 不在列。`add` 不受影响。

要应用预设，先造一个最小 Vite 骨架再跑，别去改本仓库的 `package.json` 骗检测：

```bash
mkdir -p /tmp/probe/src && cd /tmp/probe
# 需要 package.json(含 vite+react+tailwindcss)、vite.config.ts、tsconfig.json(paths: @/*)、
# index.html、src/index.css(@import "tailwindcss";)
npx shadcn@latest init --preset <code> --base radix --yes --no-reinstall --cwd /tmp/probe
```

然后把 `/tmp/probe/src/index.css` 的变量块搬回 `src/renderer/index.css`，
`components.json` 的 `style` / `baseColor` / `menuColor` 一并对齐。
**预设的 `style` 会改变组件源码**（luma 的按钮是 `rounded-4xl` 胶囊形），
光换 CSS 变量只能换配色，形状不会变。

### 类别选择统一用勾选列表，不要用 ToggleGroup

扫描页的「厂区 / 机台 / 班次 / 时段 / 等级 / 类型」都是多选或单选的选项集合，
统一用 `components/ChoiceList` 里的 `ChoiceList`（多选）和 `ChoiceRadio`（互斥）。

原因不是审美：Luma 主题里 ToggleGroupItem 的选中态是 `bg-muted`，与页面白底
只有 **1.11:1** 的对比度，hover 还是同一个色，现场根本看不出哪些被选上了。
勾选框的选中态是 `bg-primary` 实心填充（6.8:1）。

加新的类别时按数据形态给列数：长名字（类型、机台）1–2 列，纯数字（时段）3 列，
超过十几条再开 `scroll`。

## 这个项目的几条硬约束

**架构**：Electron 三进程，IPC 契约全部集中在 `src/shared/ipc.ts`。新增通道三处一起改：
`shared/ipc.ts` 定类型 → `main/ipc.ts` 注册 → `preload/index.ts` 暴露，漏一处就断链。

**配置落盘**：只走 `src/main/settings.ts` 写 `userData/settings.json`，不要在渲染层用 `localStorage`
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

**环境变量优先级**：`环境变量 > 设置页 > 默认值`，实现在 `src/main/load.ts` 的 `loadFrom()`。
被环境变量接管的项，设置页会把输入框标灰（`AppSettings.envOverrides`）。加新档位时这个字段要同步。

**网络错误判定**：只有 `fsx.ts` 里 `NETWORK_CODES` 列出的错误码才算「不可达」，其余一律按
「目录不可用」处理。断网熔断全靠这个判定，把路径问题算成断网会直接暂停整个任务并提示
「请接专用内网」，现场极难查。同理，探测第二层目录（力禧特的共享名、利珀的标识目录）
不要读 `\\IP` 这种只有主机的 UNC 根——Windows 枚举它会返回 EINVAL/ERROR_BAD_NETPATH，
跟断网的表现一模一样，要按已知候选名直接读子目录。

**扫描历史是三类页面的公共能力**：EL / 力禧特 / 利珀都必须挂 `HistoryPanel`，
三处共用 `hooks/useHistoryRestore` 回填参数与载入快照。当前任务快照只存在内存里，
重启后为空，历史是唯一的恢复入口——少挂一个页面，那一类扫描的结果就等于「扫完就没了」。
新增扫描类别时先确认这一点。

**退出前抢救未完成任务**：`main/index.ts` 的 `before-quit` 会拦住退出，调
`scanner/registry.ts` 的 `persistUnfinished()`，把还在跑的任务按 `interrupted`
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

**提交信息**：Conventional Commits，由 commitlint 校验，格式 `type(scope): 描述`。

## 改完自检

```bash
pnpm typecheck                    # 类型
pnpm lint                         # ESLint
pnpm format:fix                   # Prettier（检查用 pnpm exec prettier --check "src/**/*.{ts,tsx}"）
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

`.agents/` 是第三方 skill 文档，已加进 `.prettierignore`。跑 `format:fix` 前请确认它还在忽略列表里，
否则会把别人的文档整篇重排，混进 diff 里。
