# AGENTS.md

给接手这个项目的 AI 助手看的说明。人也可以看，但内容偏向「做之前先读什么」。

## 先读这些

| 场景 | 该读什么 |
| --- | --- |
| 要动 UI、加组件、调整样式 | [`.agents/skills/shadcn/SKILL.md`](.agents/skills/shadcn/SKILL.md) |
| 只关心某类写法对错 | 同目录 `rules/` 下对应文件（styling / forms / composition / icons / base-vs-radix） |
| 不清楚 shadcn CLI 怎么用 | 同目录 `cli.md`、`registry.md` |
| 整体怎么跑起来 | [`README.md`](README.md) |

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

## 这个项目的几条硬约束

**架构**：Electron 三进程，IPC 契约全部集中在 `src/shared/ipc.ts`。新增通道三处一起改：
`shared/ipc.ts` 定类型 → `main/ipc.ts` 注册 → `preload/index.ts` 暴露，漏一处就断链。

**配置落盘**：只走 `src/main/settings.ts` 写 `userData/settings.json`，不要在渲染层用 `localStorage`
存业务配置——主进程扫描时读的是磁盘，两边会不一致。写文件是「临时文件 + rename」的原子写，别改成直接写。

**环境变量优先级**：`环境变量 > 设置页 > 默认值`，实现在 `src/main/load.ts` 的 `loadFrom()`。
被环境变量接管的项，设置页会把输入框标灰（`AppSettings.envOverrides`）。加新档位时这个字段要同步。

**版本号**：`fix:` 递增 patch，`feat:` 递增 minor，`!` 或 `BREAKING CHANGE` 递增 major。
这套逻辑在 `.husky/commit-msg` + `scripts/auto-version.cjs`，`post-commit` 负责把版本号 amend 进同一个提交。
**不要手动改 `package.json` 的 version，也不要再补 `chore(release)` 提交。**

**提交信息**：Conventional Commits，由 commitlint 校验，格式 `type(scope): 描述`。

## 改完自检

```bash
pnpm typecheck                    # 类型
pnpm lint                         # ESLint
pnpm format:fix                   # Prettier（检查用 pnpm exec prettier --check "src/**/*.{ts,tsx}"）
pnpm build                        # 构建
```

四条全过再提交。UI 改动建议用截图确认，别只看编译通过。
