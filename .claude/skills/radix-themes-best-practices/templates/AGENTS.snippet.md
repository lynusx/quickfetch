<!-- templates/AGENTS.snippet.md —— 把下面这段粘进使用方项目的 AGENTS.md / CLAUDE.md -->

## Radix Themes（本项目 UI 库）

本项目用 `@radix-ui/themes`，不引入 shadcn/ui、Tailwind、MUI、Ant Design 等自带主题体系的库。

- **布局写在 props 里**（`direction` / `gap` / `p` / `minWidth` / `flexGrow`），**外观写在 CSS 里**（`border` / `background` / 伪类）。同一属性只写一处——CSS 后加载会静默吃掉 props，改 prop 不会有任何反应。
- **文字放进 `Text` / `Heading`**；字号只由 `size` 决定，CSS 不写 `font-size` / `line-height` / `letter-spacing`。
- **颜色只用令牌**：`var(--accent-9)` / `var(--gray-a5)`；不写 hex，不写 `rgb()`。
- **间距是单个档位** `"0"`–`"9"`；多值拆成 `py` / `px`，不要写 `p="2 4"`。
- **主题只在根节点 `<Theme>` 配一次**，只写偏离默认值的项；组件 prop 同理（`<Badge>` 不必写 `size="1"`）。例外：`Text` 没有默认 `size`，不写等于继承父级字号，必须写。
- **不要手搓已有组件**：`Card` / `Badge` / `Table` / `Callout` / `Separator` / `Progress` / `ScrollArea` 都有。
- **组件页找不到的 prop 可能来自底层 primitive**：先用 `onEscapeKeyDown` / `open` / `side` / `type` 这类继承 prop，不要自己写 `keydown` 监听或定位计算。

改完 UI 后跑项目的类型检查与 lint；细节与排查手册见 `radix-themes-best-practices` skill。
