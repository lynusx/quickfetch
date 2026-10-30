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
  /** 本次扫描的任务 ID，用于进度事件与取消操作对应 */
  taskId: string
  /** DC 下匹配厂区前缀的子目录，例如 A01、A02 */
  dirs: string[]
  images: ScannedImage[]
  /** 实际读取过的目录数 */
  scannedDirs: number
  /** 扫描耗时（毫秒） */
  elapsedMs: number
  /** 是否被用户取消；取消时 images 为空 */
  canceled: boolean
}

/** 扫描过程中的进度快照（主进程按 100ms 节流推送） */
export interface ScanProgress {
  taskId: string
  /** 已读取的目录数 */
  scannedDirs: number
  /** 已命中的图片数 */
  matched: number
  /** 当前正在读取的目录（用于展示扫描位置） */
  currentPath: string
  elapsedMs: number
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
  /** 校验根目录名、收集厂区子目录并按 6 层规则扫描图片；进度通过 onScanProgress 推送 */
  scanImages: (
    params: ScanImagesParams,
    taskId: string,
  ) => Promise<ScanImagesResult>
  /** 取消正在进行的扫描；任务已结束时静默返回 */
  cancelScan: (taskId: string) => Promise<void>
  /** 订阅扫描进度，返回取消订阅函数 */
  onScanProgress: (listener: (progress: ScanProgress) => void) => () => void
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
