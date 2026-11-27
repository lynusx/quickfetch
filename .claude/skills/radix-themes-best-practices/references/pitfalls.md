# 常见陷阱：21 类症状 → 根因 → 改法

按渲染异常或代码异味检索。每条包含**症状、根因、正向改法与排查命令**。

## 目录

| # | 症状 | 自动检测 |
| --- | --- | --- |
| 1 | prop 写了不生效，改它没反应 | 半自动 |
| 2 | 元素贴边，内边距静默变成 `0` | ✅ |
| 3 | 字号不对 / 行高怪 / 字距乱 | ✅ |
| 4 | 加了 `truncate` 但长文本仍撑破容器 | 半自动 |
| 5 | 文本层级弱化或跟随主题色写错 | 半自动 |
| 6 | 卡片圆角、内边距或高度各处不一致 | 半自动 |
| 7 | 改了根 `<Theme>`，局部没跟着变 | ✅ |
| 8 | 用裸标签手搓了已有组件 | ✅ |
| 9 | 嵌套 `<Theme>` 后灰阶色调不协调 | 半自动 |
| 10 | 样式验证数据与实际渲染对不上 | 靠流程 |
| 11 | 误判组件无此能力，手写全局事件或定位 | 半自动 |
| 12 | `Tooltip` 悬浮在 `disabled` 元素上不出现 | 半自动 |
| 13 | `Select` 下拉菜单直接盖在触发按钮上方 | ✅ |
| 14 | 为改手型光标在业务类写 `cursor: pointer` | ✅ |
| 15 | 响应式断点写成 `base` 导致默认基线丢失 | ✅ |
| 16 | 用大段 CSS 强改成品组件的内部结构 | ✅ |
| 17 | 绕过布局容器在 CSS 里给叶子组件写宽高与弹性 | ✅ |
| 18 | 在 CSS 中给文本写 11/12 阶或 9/10 阶颜色 | ✅ |
| 19 | 在容器 CSS 上写 `font-family: var(--code-font-family)` | ✅ |
| 20 | 绕过 `align` prop 在 CSS 手写 `text-align` | ✅ |
| 21 | 手写 `::-webkit-scrollbar` 代替 `ScrollArea` | ✅ |

---

## 1. prop 写了不生效，改它没反应

- **症状**：`<Grid className="choice-grid" gap="2">` 实际间距仍是 6px，改 `gap` 无变化。
- **根因**：`.rt-r-*` 工具类与项目自定义类同为 `0-1-0` 特异性，项目 CSS 在 Radix 样式表之后加载，直接覆盖了 prop（`double-write`）。
- **改法**：布局属性只留 props，从 CSS 删除重复声明；迁移前先用 `getComputedStyle` 量准旧值对应的档位。
- **排查**：
  ```bash
  grep -rnE '^\s*(display|flex|grid|gap|padding|margin|align-items|justify-content|width|height)\b' src --include=*.css
  ```

---

## 2. 元素贴边，内边距静默变成 `0`

- **症状**：写了 `<Box p="2 4">`，实际 `padding` 计算值为 `0px`。
- **根因**：`"2 4"` 不命中单档位枚举，被原样写入 `--p: 2 4`，展开为无单位 `padding: 2 4` 被浏览器丢弃。
- **改法**：拆成方向 prop `<Box py="2" px="4" />`，或传带单位 CSS 简写 `<Box p="8px 16px" />`。
- **排查**：
  ```bash
  grep -rnE '\b(p|px|py|pt|pr|pb|pl)="[^"]*[0-9] +[0-9]' src --include=*.tsx
  ```

---

## 3. 字号不对 / 行高怪 / 字距乱

- **症状**：`<Text size="2" className="label">` 行高与字号脱节。
- **根因**：`size` 同时下发 `font-size`、`--line-height`、`--letter-spacing`；CSS 手写单向覆盖会造成半覆盖错位。
- **改法**：删掉 CSS 中的字号/行高/字距/字重声明，改用 `size` 与 `weight` prop（第三方无头库内部 DOM 除外）。
- **排查**：
  ```bash
  grep -rnE '^\s*(font-size|letter-spacing|line-height|font-weight)\s*:' src --include=*.css
  ```

---

## 4. 加了 `truncate` 但长文本仍撑破容器

- **症状**：`<Text truncate>` 未出现省略号，反而把右侧按钮顶出视口。
- **根因**：Flex/Grid 子项默认 `min-width: auto`，不会缩到小于内容宽度。
- **改法**：从外层到文本包裹层的每一级弹性子项均补 `minWidth="0"`（Grid 列用 `minmax(0, 1fr)`），右侧固定元素外包 `<Box flexShrink="0">`。
- **排查**：`grep -rn 'truncate' src --include=*.tsx` 逐处检查外层是否有 `minWidth="0"`。

---

## 5. 文本层级弱化或跟随主题色写错

- **症状**：为弱化说明文字写了 `color: var(--gray-9)` / `var(--gray-10)` 导致深浅模式下对比度不达标；或想让文字跟随强调色却写错了变量。
- **根因**：Radix Colors 中可读文本仅限 11/12 阶（9/10 阶对比度低于 WCAG AA 4.5:1，仅用于实心底色或装饰图标）；且 `Text` 的 `color` prop 只接具名色，无 `"accent"` 枚举。
- **改法**：
  - 弱化可读文本统一组合 `<Text size="1" color="gray">`（必要时配 `weight="light"`）；9 阶仅用于图标或图形；
  - 语气色优先在 TSX 用映射表传 `color` prop；确需动态跟随根 `accentColor` 时可在注释说明后对特定状态类使用 `color: var(--accent-11)`。
- **排查**：
  ```bash
  grep -rnE 'color:\s*var\(--(gray|accent)-(9|10)\)' src --include=*.css
  ```

---

## 6. 卡片圆角、内边距或高度各处不一致

- **症状**：不同页面的白色面板圆角或边框粗细不统一；从手写 `border` 换成 `<Card>` 后矮了 2px。
- **根因**：多处各自手写 `background + border + border-radius`；而 `<Card>`（默认 `surface`）采用 `::after` inset ring 描边，不占盒模型高度（矮 2px 属正常现象）。
- **改法**：全项目复用 `<Card>`，若需统一零内边距底座只保留一处共享类修改 `--base-card-padding-*`，不覆盖 `--base-card-border-radius`。
- **排查**：`grep -rn 'border-radius' src --include=*.css | grep -v 'var(--radius'`

---

## 7. 改了根 `<Theme>`，局部没跟着变

- **症状**：调整根 `radius` 或 `accentColor` 后部分区域无变化。
- **根因**：局部写死了像素圆角、hex 颜色，或在后代组件上重复传了 `radius` / `accentColor`。
- **改法**：替换为 `var(--radius-*)` / `var(--accent-*)` 令牌，清理后代冗余主题 prop。
- **排查**：
  ```bash
  grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src --include=*.css --include=*.tsx
  ```

---

## 8. 用裸标签手搓了已有组件

- **症状**：用 `<div className="badge">`、`overflow-y: auto`、Grid 伪造表格或 Flex 伪造键值列表。
- **根因**：未先核对内置 56 组件清单（[components.md §1](components.md#1-先看清-api-形态)）。
- **改法**：分别替换为 `Badge`、`ScrollArea`、`Table.*`、`DataList.*`、`Callout.*`、`Separator`。
- **排查**：`grep -rnE '<(div|span|p|h[1-6])\b' src --include=*.tsx`

---

## 9. 嵌套 `<Theme>` 后灰阶色调不协调

- **症状**：暖色父主题内嵌冷色 `<Theme accentColor="blue">`，内部灰字仍偏暖。
- **根因**：嵌套 `<Theme>` 默认继承父级**已解析**的灰阶名，而非重新按 `'auto'` 计算。
- **改法**：内层显式补 `grayColor="auto"`；若只是单个按钮变色，直接传 `<Button color="blue">`。

---

## 10. 样式验证数据与实际渲染对不上

- **症状**：看代码以为内边距生效，实际渲染为 `0`。
- **根因**：脱离 `.radix-themes` 子树测量，或仅凭目测 CSS 未读计算样式。
- **改法**：确保被测节点位于 `.radix-themes` 内（`el.closest('.radix-themes') !== null`），重构前后均以 `getComputedStyle(el)` 核对。

---

## 11. 误判组件无此能力，手写全局事件或定位

- **症状**：手写 `window.addEventListener('keydown')` 监听 Esc，或手算弹层坐标。
- **根因**：只看了 Themes 组件页新增 prop 表，漏查底层 Primitive 继承面。
- **改法**：先查 [components.md §11](components.md#11-继承-prop-面)，直接使用 `onEscapeKeyDown`、`onPointerDownOutside`、`sideOffset`、`collisionPadding` 等原生继承 prop。
- **排查**：
  ```bash
  grep -rnE "addEventListener\('(keydown|pointerdown|mousedown)'|getBoundingClientRect\(\)" src --include=*.tsx
  ```

---

## 12. `Tooltip` 悬浮在 `disabled` 元素上不出现

- **症状**：`<Tooltip content="无权限"><Button disabled>提交</Button></Tooltip>` 无反应。
- **根因**：HTML `disabled` 表单控件不派发指针事件，`Tooltip` 收不到触发信号。
- **改法**：外包一层可聚焦容器承接指针与键盘焦点：
  ```tsx
  <Tooltip content="当前无权操作">
    <Box as="span" display="inline-block" tabIndex={0}>
      <Button disabled style={{ pointerEvents: 'none' }}>提交</Button>
    </Box>
  </Tooltip>
  ```

---

## 13. `Select` 下拉菜单直接盖在触发按钮上方

- **症状**：点开 `Select.Trigger` 时菜单居中压在按钮正上方。
- **根因**：`Select.Content` 默认 `position="item-aligned"`（桌面原生选择器对齐模式）。
- **改法**：显式传 `<Select.Content position="popper" sideOffset={4}>`。
- **排查**：`grep -rn '<Select.Content' src --include=*.tsx | grep -v 'position="popper"'`

---

## 14. 为改手型光标在业务类写 `cursor: pointer`

- **症状**：给按钮类硬写 `cursor: pointer`，导致 `disabled` 按钮失去了 `not-allowed` 禁用光标。
- **根因**：覆盖了组件类样式，破坏了 `--cursor-disabled` 令牌分支。
- **改法**：在全局 `:root` 覆盖 `--cursor-button: pointer;` 等光标令牌（见 [theming.md §4.2](theming.md#42-cursors-光标令牌)）。
- **排查**：`grep -rnE '^\s*cursor:\s*pointer' src --include=*.css`

---

## 15. 响应式断点写成 `base` 导致默认基线丢失

- **症状**：`columns={{ base: '1', md: '3' }}` 在窄屏下丢失单列布局或触发类型错误。
- **根因**：Radix 断点起始键为 `initial`，不识别 `base`。
- **改法**：统一改为 `columns={{ initial: '1', md: '3' }}`。
- **排查**：`grep -rnE '\{\{[^}]*\bbase\s*:' src --include=*.tsx`

---

## 16. 用大段 CSS 强改成品组件的内部结构

- **症状**：针对 `.rt-Button` / `.rt-Badge` 用 `!important` 清空 `padding`、改写 `height` 与虚线框。
- **根因**：违背 As-Is 原则，破坏内置焦点环与交互状态机。
- **改法**：形态偏离成品组件时，用 `Flex`/`Box`/`Text` + 令牌搭外观，外包 `<Button asChild variant="ghost">` 赋予交互语义。
- **排查**：`grep -rnE '(\.rt-Button|\.rt-Card|\.rt-Badge)' src --include=*.css`

---

## 17. 绕过布局容器在 CSS 里给叶子组件写宽高与弹性

- **症状**：给 `Text`、`Slider`、`Badge` 挂类名并在 CSS 中写 `flex: 1 1 0`、`min-width: 0`、`max-height: 240px`。
- **根因**：非布局组件无 `LayoutProps`，把尺寸弹性藏进 CSS 会脱离响应式系统并造成双写隐患。
- **改法**：外包 `<Box>` / `<Flex>`，通过 `flexGrow`、`minWidth="0"`、`maxHeight` props 显式控制（见 [rules.md §6.4](rules.md#64-几何尺寸与弹性包裹)）。
- **排查**：
  ```bash
  grep -rnE '^\s*(min-width|max-width|flex|flex-grow|flex-shrink|flex-basis|align-self)\s*:' src --include=*.css
  ```

---

## 18. 在 CSS 中给文本写 11/12 阶颜色

- **症状**：专门建 `.title { color: var(--gray-12) }` 或 `.desc { color: var(--gray-11) }`。
- **根因**：12 阶已由根默认继承，11 阶已由 `color="gray"` 原生提供，写进 CSS 会形成颜色泄漏并覆盖后续 `color` prop。
- **改法**：删除这类纯静态文本颜色类，正文不传 `color`，次级文本传 `color="gray"`（祖先 `:hover` / `[aria-current]` 联动变色除外）。
- **排查**：`grep -rnE 'color:\s*var\(--gray-(11|12)\)' src --include=*.css`

---

## 19. 在容器 CSS 上写 `font-family: var(--code-font-family)`

- **症状**：为显示路径或编号在容器类上声明等宽字体供 `Text` 继承。
- **根因**：忽略了内置绑定 `--code-font-family` 的 `<Code>` 与 `<Kbd>` 构建块。
- **改法**：改用 `<Code size="1" variant="ghost" color="gray" truncate>`（原生 `<input>` 路径输入框除外）。
- **排查**：`grep -rnE 'font-family:\s*var\(--code-font-family\)' src --include=*.css`

---

## 20. 绕过 `align` prop 在 CSS 手写 `text-align`

- **症状**：在空状态或数值列 CSS 里写 `text-align: center` / `right`。
- **根因**：`Text`、`Heading`、`Blockquote` 原生自带响应式 `align` prop。
- **改法**：删掉 CSS `text-align`，直接传 `<Text align="center">` 或 `<Table.Cell justify="end">`。
- **排查**：`grep -rnE 'text-align:\s*(center|right|left)' src --include=*.css`

---

## 21. 手写 `::-webkit-scrollbar` 代替 `ScrollArea`

- **症状**：在 CSS 中定制 `::-webkit-scrollbar` 宽度与滑块色。
- **根因**：忽略了 `<ScrollArea>` 的跨平台虚拟滚动条与 `size`（`1` 紧凑 4px / `2` 标准 8px / `3` 宽松 12px）、`type`（默认 `'hover'`，常驻自动传 `'auto'`）props。
- **改法**：删除 WebKit 滚动条伪元素样式，改用 `<ScrollArea type="auto" size="1" | "2">`。
- **排查**：`grep -rnE '::-webkit-scrollbar' src --include=*.css`
