import { Flex } from '@radix-ui/themes'

import './brand-mark.css'

/**
 * 应用标识：QuickFetch 的 Q。
 *
 * 圆环 + 右下角的圆点尾巴，比字母本身更圆润；矢量内联，不依赖图片资源，
 * 颜色走 currentColor，底色走 .brand-mark 的 accent 令牌，换主题时自动跟随。
 * 与 build/icon.ico、favicon.svg 是同一个符号，改动时三处一起改。
 */
export const BrandMark = () => (
  <Flex
    className="brand-mark"
    align="center"
    justify="center"
    aria-hidden="true"
  >
    {/* viewBox 收到符号自身的包围盒，保证 Q 在方块里占 72%，和 exe 图标一致 */}
    <svg width="27" height="27" viewBox="38 38 180 180" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M126 38A88 88 0 1 1 125.9 38ZM126 78A48 48 0 1 0 126.1 78Z"
      />
      <circle cx="186" cy="186" r="32" />
    </svg>
  </Flex>
)

export default BrandMark
