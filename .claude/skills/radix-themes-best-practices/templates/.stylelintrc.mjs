// templates/.stylelintrc.mjs
// 复制到使用方项目根。目的：把「双写」里最容易自动判定的那一半变成构建失败。
// 依赖：pnpm add -D stylelint

export default {
  rules: {
    // 字号三件套只由 Radix 的 size prop 决定。CSS 里出现任何一个，都是双写。
    'declaration-property-value-disallowed-list': {
      'font-size': ['/.*/'],
      'line-height': ['/.*/'],
      'letter-spacing': ['/.*/'],
    },

    // 颜色只用令牌：var(--accent-9) / var(--gray-a5)
    'color-no-hex': true,
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla'],
  },

  ignoreFiles: [
    'node_modules/**',
    'dist/**',
    // 第三方库的令牌覆盖层是例外：react-day-picker 这类必须设 font-size / line-height
    // 才能跟令牌对齐，见 references/missing-components.md。按项目实际路径改。
    'src/**/*-override.css',
  ],
}

// 不做的事（故意的）：
// - 不禁 CSS 里的 margin / padding / gap：合法场景太多（第三方覆盖层、固定尺寸元素），
//   禁掉会产生大量误报，真有双写时由 SKILL.md 的 grep 清单人工兜。
// - 不校验 border-radius 是否走 var(--radius-*)：stylelint 核心规则表达不了
//   「必须是令牌前缀」，需要自定义插件，收益不抵成本。
