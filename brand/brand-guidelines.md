# QuickFetch（秒取）标志规范

## 标志

符号是一个 **Q**：圆环 + 右下角的圆点尾巴。尾巴短、两端都收成圆，比印刷体里的 Q 更圆润；
去掉任何一条边都不再是 Q，这是它唯一需要守住的结构。

- 符号本体：`symbol.svg`（墨黑，`#111111`）
- 应用图标：**同一个 Q 反白**，压在圆角方块（圆角 = 边长的 24%）上
- 字标：`QuickFetch` 在上（Public Sans 600 / 36px / 字距 0.5 / 72% 黑），`秒取` 在下（58px / 700 / 字距 6）。
  中文是主名，英文是小字标注；不写副标题

## 两个颜色版本（任选，随时可换）

| 版本 | 底色                        | 适用                       |
| ---- | --------------------------- | -------------------------- |
| 靛蓝 | `#3E63DD`（Radix indigo-9） | 与界面主题色一致，默认使用 |
| 墨黑 | `#111111`                   | 更中性，任务栏里不抢眼     |

两者只有底色不同，Q 一律是白色 `#FFFFFF`。

**换版**：把选中的 `icon-<版>.svg / .png / .ico` 复制到 `build/icon.ico`、`build/icon.png`，
再把 `icon-<版>.svg` 复制到 `src/renderer/public/img/favicon.svg` 并重新生成 `favicon.ico`：

```bash
cp brand/icon-ink.ico build/icon.ico                              # 打包进 exe
cp brand/icon-ink.png build/icon.png                              # 打包备用
cp brand/icon-ink.png src/renderer/public/img/icon.png            # 窗口 / Dock 运行期图标
cp brand/icon-ink.svg src/renderer/public/img/favicon.svg
python3 .claude/skills/logo-design/scripts/render_png.py brand/icon-ink.svg \
  --out-dir /tmp --size 48 --ico src/renderer/public/img/favicon.ico --ico-sizes 16 32 48
```

切到墨黑后，侧边栏的 `.brand-mark` 底色仍取 `var(--accent-9)`（靛蓝）。要让两者一致，
把 `src/renderer/components/brand-mark/brand-mark.css` 的 `background` 改成 `#111111`。

## 文件

| 文件                        | 用途                                            |
| --------------------------- | ----------------------------------------------- |
| `symbol.svg`                | 纯符号，用于单色、深色底、文档                  |
| `icon-indigo.svg/.png/.ico` | 应用图标（靛蓝），ico 含 16/24/32/48/64/128/256 |
| `icon-ink.svg/.png/.ico`    | 应用图标（墨黑），同上                          |
| `lockup-horizontal.svg`     | 横向组合标志（**字标是活字，交付前需转曲**）    |

## 尺寸与留白

- 应用图标最小 **16px**；16px 以下不再缩小，改用符号本身。
- 符号单独使用时，最小 **24px**。
- 安全边距 = Q 笔画宽度（16px 图标上约 1.5px）。图标内 Q 占方块边长的 72%，四周留白 14%。
- 不要为了「填满」把 Q 放大到贴边——右下角的圆点尾巴需要呼吸。

## 色值

| 用途 | HEX       | RGB           |
| ---- | --------- | ------------- |
| 墨黑 | `#111111` | 17, 17, 17    |
| 靛蓝 | `#3E63DD` | 62, 99, 221   |
| 反白 | `#FFFFFF` | 255, 255, 255 |

单色印刷用墨黑版；反白版把 Q 换成白色、底色换成品牌色或深色底。

## 禁用

- 不要拉长、压扁、旋转 Q。
- 不要给 Q 加投影、描边、渐变或高光。
- 不要把 Q 从方块里裁掉一部分，也不要让尾巴伸出方块。
- 不要把方块换成圆形或去掉圆角。
- 不要在 Q 上叠字，或把 `秒取` 塞进方块内部。
- 不要用近似色（比如把靛蓝调成 `#4A6FE8`）；只用上表的色值。

## 字体

字标拉丁部分用 **Public Sans**（项目已在用，`@fontsource-variable/public-sans`，SIL OFL，可随包分发），
中文用系统字体（Windows 微软雅黑 / macOS PingFang SC）。

`lockup-horizontal.svg` 已把字体 **base64 内嵌**，所以在没装字体的机器上直接打开也能正确显示；
但浏览器以 `<img>` 方式引用 SVG 时会禁用内嵌字体并回落到系统无衬线，预览请直接打开文件或用矢量编辑器。

字仍是活字，**正式印刷 / 对外发布前必须转曲**；本仓库不附带转曲后的字标文件。
