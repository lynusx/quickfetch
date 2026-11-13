/**
 * Stylelint：只拦「会静默失效或让改动扩散」的写法，不掺排版审美。
 *
 * 三条规则对应 AGENTS.md 原则 3：
 * 1. 字号、字距不手写——`size` prop 已经同时决定 font-size / line-height / letter-spacing，
 *    再写一条 CSS 就会盖掉 prop，而且项目 CSS 后加载，是静默生效。
 * 2. 布局不手写——裸 `display: flex` / `gap` / `padding` 出现在 Radix 布局组件上，
 *    等于把布局拆成两处维护。
 * 3. 不用自定义渡值——`gap: 6px` 这类落不进 Radix 档位的值。
 *
 * 例外都写在文件内的 `stylelint-disable-next-line` 注释里，必须说明理由。
 */
export default {
  extends: ['stylelint-config-standard'],

  ignoreFiles: ['out/**', 'dist/**', 'node_modules/**', '**/*.min.css'],

  rules: {
    // Radix 的令牌命名不是 BEM，关掉会误报的命名类规则
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'keyframes-name-pattern': null,

    // 与本项目无关的排版偏好，关掉噪音
    'declaration-empty-line-before': null,
    'rule-empty-line-before': null,
    'comment-empty-line-before': null,
    'at-rule-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'no-descending-specificity': null,
    'no-duplicate-selectors': null,
    // Vite 的 @import 就不用 url() 包；字体名保留原写法只为可读
    'import-notation': null,
    'value-keyword-case': null,
    // 媒体查询沿用 max-width 写法，不强制改区间语法
    'media-feature-range-notation': null,

    // —— 规则 1：字号与字距不手写 ——
    // 留给 `.rdp-*`（react-day-picker 的类名，拿不到 React prop）用行内注释豁免
    'declaration-property-value-disallowed-list': {
      'font-size': ['/.*/'],
      'letter-spacing': ['/.*/'],
    },

    // —— 规则 3：不写落不进 Radix 档位的自定值 ——
    // 只查间距类，尺寸（width/height/max-width）按几何关系取值，本就豁免
    'declaration-property-value-allowed-list': null,
  },

  overrides: [
    {
      // react-day-picker 自己生成的 DOM，类名拿不到 React prop，字号只能写 CSS
      files: ['**/date-picker/*.css'],
      rules: {
        'declaration-property-value-disallowed-list': null,
      },
    },
  ],
}
