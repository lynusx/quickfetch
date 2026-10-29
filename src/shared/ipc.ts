// 渲染层与主进程之间的 IPC 契约。
// 主进程（src/main）与 preload 均直接引用本文件，保证两端类型一致。

export interface DirectoryInfo {
  path: string
  name: string
}

export interface ScanImagesParams {
  rootPath: string
  plant: 'A' | 'B'
  date: string
  shift: '白班' | '夜班'
  times: string[]
  types: string[]
}

export interface ScannedImage {
  /** 相对 DC 根目录的展示路径，统一使用 / 分隔（用于 source.txt 与日志） */
  path: string
  /** 真实绝对路径，仅用于主进程拷贝，不展示 */
  absolutePath: string
  name: string
}

export interface ScanImagesResult {
  /** DC 下匹配厂区前缀的子目录，例如 A01、A02 */
  dirs: string[]
  images: ScannedImage[]
}

export interface CopyProgress {
  copied: number
  total: number
  failed: number
}

export interface CopyImagesResult {
  copied: number
  failed: string[]
}

export interface ElectronAPI {
  getVersion: () => Promise<string>
  /** 打开系统目录选择框；用户取消时返回 null */
  pickDirectory: (options?: { title?: string }) => Promise<DirectoryInfo | null>
  /** 校验根目录名、收集厂区子目录并按 6 层规则扫描图片 */
  scanImages: (params: ScanImagesParams) => Promise<ScanImagesResult>
  /** 批量拷贝图片到目标目录，进度通过 onCopyProgress 推送 */
  copyImages: (params: {
    files: string[]
    targetDir: string
  }) => Promise<CopyImagesResult>
  /** 订阅拷贝进度，返回取消订阅函数 */
  onCopyProgress: (listener: (progress: CopyProgress) => void) => () => void
  /** 写入文本文件（source.txt），内容按行拼接 */
  writeTextFile: (params: {
    dir: string
    filename: string
    lines: string[]
  }) => Promise<void>
  /** 弹出另存为对话框并写入 xlsx；用户取消时返回 null */
  saveExcel: (params: {
    defaultName: string
    data: Uint8Array
  }) => Promise<string | null>
}
