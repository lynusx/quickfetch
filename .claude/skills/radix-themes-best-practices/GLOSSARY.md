# Radix Themes Best Practices

这个 context 是一份写给 AI agent 的操作指南：让它在 `@radix-ui/themes` 项目里写 UI 时一次写对，出现问题时能自己查。
下面的词汇是这份指南自己的语言。

## Language

**double-write（双写）**:
同一属性在 props 与自写 CSS 里各声明一次；两者同特异性，后加载者胜，prop 静默失效。
_Avoid_: 重复 CSS、样式覆盖、CSS 和 props 冲突

**hand-rolled component（手搓组件）**:
用裸元素重新实现 `Card` / `Badge` / `ScrollArea` / `Table` 这类已经存在的组件。
_Avoid_: 乱用组件、自己写一个、自定义组件

**silent failure（静默失败）**:
不报错、类型检查通过、控制台干净，但渲染结果不对的失败。
_Avoid_: 样式不生效、有 bug、样式没写对

**scale step（档位）**:
Radix 的单个枚举值 `"0"`–`"9"`，对应固定像素；它不是像素值，也不是 CSS 简写。
_Avoid_: 间距值、spacing、尺寸数字

**token（令牌）**:
由 `<Theme>` 下发、写成 `var(--gray-a5)` 形式的 CSS 变量；外观只允许引用令牌。
_Avoid_: 变量、颜色值、主题色

**inherited prop surface（继承 prop 面）**:
Themes 组件从底层 primitive 继承来的 prop 集合；可能跨多个部件合并，也可能被单个禁用。
_Avoid_: 底层 props、额外属性、primitive 的 API

**prop source（prop 源）**:
Themes 组件页 API Reference 首句链接到的同名 primitive 页；只读它的 API 表，用来补组件页没列的继承 prop。它的示例不是用法参考——那是无样式组件 + 手写 CSS。
_Avoid_: primitive 文档、底层文档、官方 API

**building block（构建块）**:
14 个原子组件——布局 5 个（`Box` / `Flex` / `Grid` / `Container` / `Section`）+ 排版 9 个（`Text` / `Heading` / `Link` / `Code` / `Kbd` / `Blockquote` / `Quote` / `Strong` / `Em`）。只负责结构与文字，不带业务语义。
`Card` / `Badge` / `Table` / `Dialog` 等是**成品部件**：带语义与外观，用来解决具体场景，不是拼界面的默认单元。
_Avoid_: 原子组件、基础组件、primitive（那是 Radix Primitives，另一套东西）
