// templates/.stylelintrc.mjs
// 复制到使用方项目根目录，将「字号双写」与「硬编码颜色」拦截在 lint 阶段。
// 依赖：pnpm add -D stylelint stylelint-config-standard

export default {
  extends: ['stylelint-config-standard'],

  rules: {
    // 字号与字距只由 Radix Typography 的 size prop 派生；若项目无特殊行高微调也可一并加入 'line-height'
    'declaration-property-value-disallowed-list': {
      'font-size': ['/.*/'],
      'letter-spacing': ['/.*/'],
    },

    // 外观颜色统一引用 Radix 令牌：var(--accent-*) / var(--gray-*)
    'color-no-hex': true,
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla'],
  },

  overrides: [
    {
      // 第三方无头组件内部生成的 DOM（如 react-day-picker）拿不到 Radix Text prop，在覆盖层局部豁免
      files: ['**/date-picker/*.css', '**/*-override.css'],
      rules: {
        'declaration-property-value-disallowed-list': null,
      },
    },
  ],

  ignoreFiles: ['node_modules/**', 'dist/**', 'out/**'],
}
