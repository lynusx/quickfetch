import { Flex } from '@radix-ui/themes'

import './BrandMark.css'

/**
 * 应用标识。
 *
 * 四角框 + 中心点表示「扫描取图」，不依赖任何外部图片资源，
 * 颜色全部走主题令牌，换主题色时自动跟随。
 */
export const BrandMark = () => (
  <Flex
    className="brand-mark"
    align="center"
    justify="center"
    aria-hidden="true"
  >
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" />
      <path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" />
      <path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" />
      <path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  </Flex>
)

export default BrandMark
