/**
 * 扫描与复制共同认可的图片扩展名。
 *
 * 这里是唯一的格式清单：扫描端的文件明细、复制端的计划/预检查/清单都调用
 * `isImageFile`。新增格式只改这里，不要再在别的文件里维护第二份列表 ——
 * 森标 AOI 最初就是因为扫描端单独写了一份 png/jpg 列表，`.bmp` 一张都不认，
 * 真机上表现为「类型目录存在，但里面没有图片文件」。
 *
 * 覆盖 MDN「图像文件类型」页面里可能作为产线采集结果出现的位图格式：
 * JPEG 家族、PNG/APNG、WebP、AVIF、GIF、BMP/DIB、TIFF。
 *
 * 刻意不包含：
 * - SVG/SVGZ：矢量图，不是产线采集的位图；
 * - ICO/CUR：图标/光标，出现在类型目录里通常是杂物；
 * - HEIC/HEIF、JPEG XL：MDN 页面未列为常见图片格式，现场也没出现过；
 *   以后现场真的产出了，再按实际格式追加。
 *
 * 参考：https://developer.mozilla.org/zh-CN/docs/Web/Media/Guides/Formats/Image_types
 * 注意：`electron.vite.config.ts` 里的扩展名只决定渲染层构建产物放
 * `img/` 还是 `assets/`，与运行时能不能识别图片无关，不要把两者合并。
 */
export const IMAGE_EXTENSIONS = new Set([
  // JPEG 家族：相机/检测软件常见的几种别名
  '.jpg',
  '.jpeg',
  '.jpe',
  '.jif',
  '.jfif',
  '.pjpeg',
  '.pjp',
  // PNG 与动画扩展
  '.png',
  '.apng',
  // 现代有损/无损位图
  '.webp',
  '.avif',
  // 索引色/简单动画
  '.gif',
  // 森标 AOI 原生格式（BMP 及其设备无关变体）
  '.bmp',
  '.dib',
  // 扫描/印刷常见的 TIFF
  '.tif',
  '.tiff',
])

/** 按扩展名判断是否图片；只认最后一个点之后的部分，`a.b.png` 也算 */
export const isImageFile = (name: string): boolean => {
  const dot = name.lastIndexOf('.')
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot).toLowerCase())
}
