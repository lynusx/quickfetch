// 渲染层与主进程之间的 IPC 契约。
// 主进程（src/main）与 preload 均直接引用本文件，保证两端类型一致。

export interface DirectoryInfo {
  path: string
  name: string
}

/** 厂区：由机台目录名首字母派生，A 为东区、B 为西区 */
export type Plant = 'east' | 'west'

export interface MachineInfo {
  /** DC 下的机台目录名，如 A03-B、A-LXJC-01 */
  name: string
  plant: Plant
}

/**
 * 持久化配置。根目录只存原始 UNC 路径（\\10.108.164.2\qj-dc-el\DC），
 * 不存映射盘符：盘符在别的机器上可能指向别处甚至不存在。
 */
export interface AppSettings {
  version: 1
  rootPath: string | null
  /** 工序层目录名，当前固定为 EL */
  entry: string
  machines: MachineInfo[]
  /** 上次识别机台的时间，ISO 字符串 */
  updatedAt: string | null
}

export interface ScanTaskParams {
  /** 选中的机台目录名，允许多选 */
  machines: string[]
  /** YYYYMMDD，当前仅支持单日 */
  date: string
  shift: '白班' | '夜班'
  /** 时段，个位数不补零，如 '8'、'19' */
  slots: string[]
  /** 不良类型目录名，如 NG_脏污_B */
  types: string[]
}

export interface ScannedImage {
  /** 相对 DC 根目录的展示路径，统一使用 / 分隔（用于 source.txt 与日志） */
  path: string
  /** 真实绝对路径，仅用于主进程复制，不展示 */
  absolutePath: string
  name: string
}

/** 单个机台分支的执行结果，界面诊断面板的数据来源 */
export interface ScanBranch {
  machine: string
  status: 'hit' | 'empty' | 'missing' | 'unreachable' | 'skipped'
  /** 断链发生在哪一层，用于精确提示 */
  brokenAt?: 'EL' | '日期' | '班次' | '时段' | '类型'
  /** 实际读到图片的类型目录数 */
  matchedDirs: number
  images: number
  /** 该班次目录下真实存在的时段，与勾选值取交集后才是扫描目标 */
  availableSlots?: string[]
  /** 该时段目录下真实存在的类型，用于提示「选了但目录里没有」 */
  availableTypes?: string[]
  message?: string
}

export type ScanTaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'canceled'
  | 'failed'

export type ScanPhase = 'probe' | 'collect' | 'done'

export interface ScanTaskProgress {
  phase: ScanPhase
  /** 0-100，由主进程计算，渲染层直接展示 */
  percent: number
  /** 实际发起过读取的目录数 */
  dirsScanned: number
  /** 读到图片的目录数 */
  dirsHit: number
  /** 因父级缺失而未探测的目录数 */
  dirsSkipped: number
  /** 不可达目录数 */
  dirsUnreachable: number
  images: number
  currentPath: string
}

/**
 * 任务快照。图片全量保留在主进程，这里只带统计与前 N 条预览，
 * 避免几万条对象走 IPC 序列化把渲染进程卡死。
 */
export interface ScanTask {
  id: string
  status: ScanTaskStatus
  params: ScanTaskParams
  progress: ScanTaskProgress
  branches: ScanBranch[]
  /** 暂停原因：用户主动暂停，或网络中断触发 */
  pauseReason: 'user' | 'network' | null
  error: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  totalImages: number
  preview: ScannedImage[]
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
  /** 生成的 source.txt 绝对路径 */
  manifestPath: string
  /** 同名被自动改名的数量 */
  renamed: number
}

export interface ElectronAPI {
  getVersion: () => Promise<string>
  /** 打开系统目录选择框；用户取消时返回 null */
  pickDirectory: (options?: { title?: string }) => Promise<DirectoryInfo | null>

  /** 读取持久化配置；文件不存在时返回默认值 */
  readSettings: () => Promise<AppSettings>
  /** 保存根目录并重新识别机台；路径非法时抛出可读错误 */
  saveRootPath: (rootPath: string) => Promise<AppSettings>
  /** 按当前根目录重新识别机台列表 */
  refreshMachines: () => Promise<AppSettings>

  /** 创建扫描任务（状态 pending），创建瞬间即可拿到进度快照 */
  createScanTask: (params: ScanTaskParams) => Promise<ScanTask>
  /** 启动任务；返回启动后的快照，后续进度通过 onScanTaskUpdate 推送 */
  startScanTask: (taskId: string) => Promise<ScanTask>
  pauseScanTask: (taskId: string) => Promise<ScanTask>
  resumeScanTask: (taskId: string) => Promise<ScanTask>
  cancelScanTask: (taskId: string) => Promise<ScanTask>
  getScanTask: (taskId: string) => Promise<ScanTask | null>
  /** 取任务图片分页，用于结果列表展示 */
  getScanTaskImages: (
    taskId: string,
    offset: number,
    limit: number,
  ) => Promise<{ images: ScannedImage[]; total: number }>
  /** 订阅任务快照变更，返回取消订阅函数 */
  onScanTaskUpdate: (listener: (task: ScanTask) => void) => () => void

  /** 把一个任务的图片平铺复制到目标目录，并写入 source.txt */
  copyTaskImages: (
    taskId: string,
    targetDir: string,
  ) => Promise<CopyImagesResult>
  /** 订阅复制进度，返回取消订阅函数 */
  onCopyProgress: (listener: (progress: CopyProgress) => void) => () => void

  /** 弹出另存为对话框并写入 xlsx；用户取消时返回 null */
  saveExcel: (params: {
    defaultName: string
    data: Uint8Array
  }) => Promise<string | null>
}
