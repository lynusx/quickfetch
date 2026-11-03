/**
 * 哪些文件算「图片」。
 *
 * 森标 AOI 实际产的是 `.bmp`，早期只认 png/jpg，真机上表现为
 * 「类型目录存在，但里面没有图片文件（已匹配 0 个目录，共 0 张）」——
 * 目录明明有图，软件一张都不认。这里集中定义，扫描与复制共用一份，
 * 避免两边各写一遍后逐渐分叉。
 */
export const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  // 森标 AOI 原生格式
  '.bmp',
  '.dib',
  // 现场偶尔出现的设计稿 / 高动态范围导出
  '.tif',
  '.tiff',
])

/** 按扩展名判断是否图片；只认最后一个点之后的部分，`a.b.png` 也算 */
export const isImageFile = (name: string): boolean => {
  const dot = name.lastIndexOf('.')
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot).toLowerCase())
}
