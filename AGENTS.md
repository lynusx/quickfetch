# AGENTS.md

本文件是项目级协作原则，优先于默认习惯。具体硬约束见
[`.claude/AGENTS.md`](.claude/AGENTS.md)。

## 先读这些

| 场景                            | 该读什么                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------ |
| 整体怎么跑、目录结构、UI 约定   | [`README.md`](README.md)                                                       |
| 架构、IPC、配置落盘、网络判定等 | [`.claude/AGENTS.md`](.claude/AGENTS.md)                                       |
| 要动 UI、加组件、调整样式       | [`.claude/skills/radix-themes/SKILL.md`](.claude/skills/radix-themes/SKILL.md) |

## 三条原则

1. **界面从简。** 删掉重复的标题、同义的说明文字和纯装饰标签；同一信息只出现一次。删完如果看不懂，说明信息层级或布局有问题，重排这个区域，不要靠加字补救。
   - `PageHeader` / `PanelHeader` 的 `eyebrow`、`description`、`badge` 只在提供新信息时使用，不要复述标题或彼此重复。
   - 必须保留：错误原因、破坏性操作确认、空状态指引，以及 `aria-label` / `sr-only` 等可访问名称。
   - 重排只动布局与文案，不改 IPC、数据结构、扫描与复制行为。

2. **三方兼顾。** 每次修改同时考虑用户体验、开发体验和 AI Agent 的使用体验：界面不增加无效点击，代码保持可读可维护，契约与文档能被直接找到。不以牺牲一方换另一方，不能破坏现有功能；无法兼顾时，在计划或提交信息里写明取舍。
   - 改完跑 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build`。

3. **界面只用 Radix Themes 组件。** 布局用 `Box` / `Flex` / `Grid` / `Section` / `Container`，排版用 `Text` / `Heading` / `Strong` / `Em` / `Code` / `Link` / `Blockquote`；不要在 JSX 里手写裸 `div` / `span` / `p` / `h1`–`h6` 做布局或排版。Radix 组件上的 `as="span"` / `as="div"` 是正常用法。
   - 原生 `button` / `label` / `input` / `details` / `summary` 只在语义必需时使用（现有：历史摘要行、Excel 上传区、快捷方式折叠区），并保证可访问名称；图标按钮必须有 `aria-label`。
   - 不引入 shadcn/ui、Tailwind、其它组件库或第三方全局 reset；自定义样式只用 Radix 令牌，写在 `src/renderer/styles/app.css`。

## 现场与文档底线

- **1080×600 可用**：不横向滚动、不截断主操作、不依赖 hover 才能完成关键操作。
- **键盘可达**：主要流程不依赖鼠标；删文案时保留可访问名称。
- **文档单一真相**：原则以本文件为准，细节以 `.claude/AGENTS.md` 为准；UI 细则在 README「UI 约定」与 radix skill。改规则只改一处，其余用链接引用。

## 动手前先确认

- 新增/修改 IPC 通道 → `src/shared/ipc.ts`、`src/main/ipc/<域>.ipc.ts`、`src/preload/index.ts` 三处同改。
- 改业务配置 → 只走 `src/main/services/settings/settings.ts`，不要在渲染层用 `localStorage` 存业务配置。
- 改扫描/断网逻辑 → 先读 `src/main/services/scanner/fsx.ts` 的 `NETWORK_CODES` 与断网熔断规则。
- 新增扫描类别 → 必须挂 `HistoryPanel`，并接 `useHistoryRestore`。
- 改应用名/`productName` → `userData` 目录会从 `%APPDATA%\shx-tools` 改变，老设置与历史会“消失”，必须同时写迁移。
- 提交/打包 → 版本号由提交钩子管理，不要手改 `package.json` 的 version；打包与截图只在明确要求时做。
