<!-- templates/AGENTS.snippet.md —— 复制到使用方项目的 AGENTS.md / CLAUDE.md -->

## Radix Themes UI 约束

本项目使用 `@radix-ui/themes` 构建界面，保持单一主题体系，不混入自带主题或重置体系的其他 UI 库。

- **props 管布局，CSS 管外观**：方向、间距、尺寸、弹性、对齐、网格列与区域走 `Box`/`Flex`/`Grid`/`Container`/`Section` 的 props；`border`、`background`、阴影与伪类留 CSS。同一属性只写一处，防止后加载的 CSS 静默吃掉 prop。
- **叶子组件显式包裹**：`Text`、`Slider`、`Button`、`Badge`、`ScrollArea` 等非布局组件需要控制宽高、弹性或 `minWidth="0"` 截断时，外包 `<Box>` / `<Flex>` 传 props，不在 CSS 类里写尺寸与弹性。
- **排版与颜色归口 Typography**：文字放进 `Text` / `Heading` / `Code` 等排版组件；字号只从 `size` 派生，等宽文本用 `<Code variant="ghost">`，可读文本颜色只用默认 12 阶与 `color` prop（11/12 阶），所有外观颜色与圆角引用 `var(--accent-*)` / `var(--gray-*)` / `var(--radius-*)` 令牌。
- **单值档位与 `initial` 断点**：间距档位 `"0"`–`"9"` 只传单值（多值拆 `py`/`px`）；响应式对象必须以 `initial` 作为基线。
- **省略默认 prop，善用继承 prop**：根节点 `<Theme>` 与各组件只写偏离默认值的 prop（`<Text>` 无默认 `size` 必须显式写）；弹层、下拉、滚动区优先查阅底层 Radix Primitive 继承的交互 prop（如 `onEscapeKeyDown`、`position="popper"`、`type="auto"`）。

改完 UI 后运行项目的 `typecheck`、`lint` 与 `build`；详细规则与症状排查见 `radix-themes-best-practices` skill。
