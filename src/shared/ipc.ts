// 渲染层与主进程之间的 IPC 契约。
// 主进程（src/main）与 preload 均直接引用本文件，保证两端类型一致。

export interface DirectoryInfo {
  path: string
  name: string
}

/**
 * 厂区标签。
 *
 * 以前是 'east' | 'west' 两个枚举，由机台目录名首字母派生。力禧特的机台
 * 叫 7A、LX2，前缀既没有 A 也没有 B，厂区只能来自入口目录下的文件夹名，
 * 而且以后可能多出「三区」。所以改成字符串标签，界面按机台列表去重后动态渲染。
 */
export type Plant = string

export const PLANT_LABEL: Record<string, string> = {
  east: '东区',
  west: '西区',
}

/** 老配置里的 east / west 统一换成中文，其余标签原样保留 */
export const plantLabel = (plant: Plant): string => PLANT_LABEL[plant] ?? plant

export interface MachineInfo {
  /** DC 下的机台目录名，如 A03-B、A-LXJC-01 */
  name: string
  plant: Plant
}

/**
 * 扫描类别：一类图片来源对应一套完全不同的取数逻辑。
 *
 * - el：单一根目录 + 固定工序层 EL，机台是根目录下的子目录
 * - lxt：每台机器一个 IP，入口是一堆 .lnk 快捷方式，第二层是 el / SaveImages
 * - pl：同样每台机器一个 IP、同样从 .lnk 取地址，但第二层是「机台标识」目录
 *   （名字不固定，按线别名探测），再往下多出机台名与 Fail/等级两层
 */
export type ScanCategory = 'el' | 'lxt' | 'pl'

export const SCAN_CATEGORY_LABEL: Record<ScanCategory, string> = {
  el: 'EL',
  lxt: '力禧特',
  pl: '利珀',
}

/** 力禧特第二层的两个候选共享名，探测顺序即优先级 */
export const LXT_SHARES = ['el', 'SaveImages'] as const

export type LxtShare = (typeof LXT_SHARES)[number]

/** 利珀路径里两段固定目录名，写死在协议里，只有拼路径的地方用得到 */
export const PL_FIXED = { matting: 'Matting', fail: 'Fail' } as const

/** 利珀的缺陷等级，全部可选 */
export const PL_LEVELS = ['A', 'B', 'C'] as const

export type PlLevel = (typeof PL_LEVELS)[number]

/** 偏好里能调数值的四项，用来标注「被环境变量接管」 */
export type PreferenceKey =
  'scanConcurrency' | 'scanBatchSize' | 'copyConcurrency' | 'copyBatchSize'

/** 环境变量名 → 偏好字段，主进程解析与界面提示共用一份 */
export const PREFERENCE_ENV: Record<PreferenceKey, string> = {
  scanConcurrency: 'SHX_READ_CONCURRENCY',
  scanBatchSize: 'SHX_MACHINE_BATCH',
  copyConcurrency: 'SHX_COPY_CONCURRENCY',
  copyBatchSize: 'SHX_COPY_BATCH',
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
  /** 历史扫描记录的保留条数，默认 10 */
  historyLimit: number
  /** 设置页里的复制与性能偏好 */
  preferences: AppPreferences
  /** 力禧特配置；未配置过时为默认空值 */
  lxt: LxtSettings
  /** 利珀配置；未配置过时为默认空值 */
  pl: PlSettings
  /**
   * 被环境变量接管的偏好项。
   *
   * 现场临时用 SHX_* 压降时，设置页里改这几项不会有实际效果，
   * 与其让用户猜「是不是没保存上」，不如直接标出来。
   */
  envOverrides: PreferenceKey[]
}

/** 力禧特的一台机台：入口里的一个 .lnk 解析出来的结果 */
export interface LxtMachine {
  /** 厂区标签，取自入口目录下的子文件夹名，如 东区 */
  plant: Plant
  /** .lnk 文件名（去扩展名），如 7A、LX2 */
  name: string
  /** 复合键「厂区/机台」，东西区都有 LX2，必须带厂区才唯一 */
  key: string
  /** .lnk 解析出的目标，形如 \\10.108.8.220 */
  host: string
  /**
   * 该机台实际使用的共享名，第一次扫描时探测并缓存。
   *
   * el 与 SaveImages 不同机台可能不一样，只能逐台探；为 null 表示还没探过，
   * 下次扫描该机台时补探。
   */
  share: LxtShare | null
  /**
   * 入口里已找不到这个 .lnk。
   * 不直接删除，是因为历史记录和复制分组还引用着它。
   */
  stale: boolean
}

/** 被跳过的 .lnk：解析失败，或者目标根本不是网络路径 */
export interface LxtSkippedLink {
  /** 所在厂区文件夹 */
  plant: Plant
  file: string
  reason: string
}

export interface LxtSettings {
  /** 力禧特入口根目录，其下每个含 .lnk 的子文件夹算一个厂区 */
  entryRoot: string | null
  machines: LxtMachine[]
  /** 最近一次识别时被跳过的 .lnk 清单，供界面展示 */
  skipped: LxtSkippedLink[]
  /** 最近一次识别时间，ISO 字符串 */
  updatedAt: string | null
}

/** 识别入口后回给界面的结果，顺带带上完整配置 */
export interface EntrySetupResult {
  settings: AppSettings
  /** 新增的机台数 */
  added: number
  /** 入口里已消失、被标记为 stale 的机台数 */
  removed: number
  /** 目标地址变化、share 缓存被清掉的机台数 */
  relocated: number
}

export type LxtSetupResult = EntrySetupResult
export type PlSetupResult = EntrySetupResult

/**
 * 利珀的一台机台：入口里的一个 .lnk 解析出来的结果。
 *
 * 与力禧特的差别只在第二层的含义：力禧特是固定的 el / SaveImages 二选一，
 * 利珀是「机台标识」目录，名字不固定（pl-6a、东区pl-10b、pl-03c），
 * 只能拿线别名去探测，探到之后缓存进配置。
 */
export interface PlMachine {
  /** 厂区标签，取自入口目录下的子文件夹名，如 东区 */
  plant: Plant
  /** .lnk 文件名（去扩展名），如 6B、LX2 */
  name: string
  /** 复合键「厂区/机台」；东西区都有同名线别，必须带厂区才唯一 */
  key: string
  /** .lnk 解析出的目标，形如 \\10.108.9.153 */
  host: string
  /**
   * 该机台实际使用的标识目录名，第一次扫描时按线别名探测并缓存。
   * 为 null 表示还没探过，下次扫描该机台时补探。
   */
  share: string | null
  /** 入口里已找不到这个 .lnk；不删除是因为历史记录与复制分组还引用着它 */
  stale: boolean
}

export interface PlSettings {
  /** 利珀入口根目录，其下每个含 .lnk 的子文件夹算一个厂区 */
  entryRoot: string | null
  machines: PlMachine[]
  /** 最近一次识别时被跳过的 .lnk 清单，供界面展示 */
  skipped: LxtSkippedLink[]
  /** 最近一次识别时间，ISO 字符串 */
  updatedAt: string | null
}

export interface ScanTaskParams {
  /** 选中的机台目录名，允许多选 */
  machines: string[]
  /**
   * 扫描类别。老历史记录没有这个字段，读出来时按 el 补齐。
   * 界面拿到省略值时按 el 处理，主进程建任务时总是显式传。
   */
  category?: ScanCategory
  /** YYYYMMDD，当前仅支持单日 */
  date: string
  shift: '白班' | '夜班'
  /** 时段，个位数不补零，如 '8'、'19' */
  slots: string[]
  /** 不良类型目录名，如 NG_脏污_B */
  types: string[]
  /**
   * 缺陷等级，仅利珀使用（路径里的 A/B/C 层）。
   * 其余类别的路径没有这一层，留空即可。
   */
  levels?: string[]
}

export interface ScannedImage {
  /**
   * 结果路径，统一使用 / 分隔（用于 source.txt 与日志）。
   *
   * - EL：相对 DC 根目录，形如 A03-B/EL/20261030/白班/8/NG_脏污_B/x.jpg
   * - 力禧特：每台机器一个 IP，没有共同根，所以按「厂区/机台/日期/…」
   *   拼成展示路径
   * - 利珀：同理按「厂区/机台/日期/机台名/班次/时段/等级/类型」拼
   */
  path: string
  /** 真实绝对路径，仅用于主进程复制，不展示 */
  absolutePath: string
  name: string
  /**
   * 机台标识，与 ScanBranch.machine 完全一致。
   *
   * 复制时要按机台筛选/分组，而 path 的第 0 段对力禧特、利珀来说是厂区，
   * 直接从 path 里切会切错；老历史记录没有这个字段，读出来时回落到第 0 段。
   */
  machine?: string
}

/** 单个机台分支的执行结果，界面诊断面板的数据来源 */
export interface ScanBranch {
  /** 机台标识。EL 是机台目录名；力禧特、利珀是「厂区/机台」复合键 */
  machine: string
  status: 'hit' | 'empty' | 'missing' | 'unreachable' | 'skipped'
  /** 断链发生在哪一层，用于精确提示 */
  brokenAt?:
    | 'EL'
    | '共享名'
    | '机台标识'
    | '日期'
    | '机台名'
    | '班次'
    | '时段'
    | '等级'
    | '类型'
  /**
   * 不可达的具体原因。仅 unreachable 时有值，界面按它给出不同提示：
   * 接入专用内网、共享名变了、还是没权限。
   */
  unreachableReason?: 'network' | 'share' | 'denied'
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
  /**
   * 程序退出时任务还没跑完，主进程在退出前把当前结果抢救下来。
   *
   * 与 canceled 区分开：那个是用户主动点的「取消」，这个是「被关掉了」。
   * 只出现在历史记录里，运行中的任务不会进入这个状态。
   */
  | 'interrupted'

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
  /**
   * 已探测但尚未读取文件明细的目录数。
   * 分批的意义就在这里：探测跑完整棵树很便宜，逐目录读文件明细才占内存，
   * 这个值大于 0 说明还有尾巴没扫干净。
   */
  detailsPending: number
  /** 当前生效的并发数，现场机器吃紧时会自动下调 */
  concurrency: number
  /** 当前批次序号，从 1 开始；batchTotal 为总批次 */
  batchIndex: number
  batchTotal: number
  /** 需要逐目录读文件明细的总数，收尾阶段才有值 */
  detailTotal: number
  /** 已读完备的明细目录数 */
  detailDone: number
  /** 预计剩余毫秒，样本不足时为 null */
  etaMs: number | null
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

/** 复制结果的分组方式：决定目标目录下的子文件夹层级 */
export type CopyLayout = 'flat' | 'machine' | 'type' | 'machine-type'

export const COPY_LAYOUT_LABEL: Record<CopyLayout, string> = {
  flat: '完全平铺',
  machine: '按机台分组',
  type: '按类型分组',
  'machine-type': '按机台+类型分组',
}

export type CopyStatus =
  'pending' | 'running' | 'paused' | 'completed' | 'canceled' | 'failed'

/**
 * 目标目录已有同名文件时的策略。
 * rename 是默认：目标占着的名字自动编号让开，img.jpg → img1.jpg，
 * 同名的这一组一张不少全部落盘；skip 才会整组不写。
 */
export type CopyConflictPolicy = 'rename' | 'skip' | 'overwrite'

export const COPY_CONFLICT_LABEL: Record<CopyConflictPolicy, string> = {
  rename: '自动改名',
  skip: '跳过已存在',
  overwrite: '覆盖已存在',
}

/**
 * 设置页可调的偏好，随 settings.json 一起持久化。
 *
 * 这六项以前散在三处：复制面板的 store（重启就丢）、主进程的常量、
 * 环境变量。集中到这里之后，界面只认这份值，环境变量仍可临时覆盖。
 * EL / 力禧特 / 利珀共用同一套档位。
 */
export interface AppPreferences {
  /** 复制到本地时按什么层级建子目录 */
  copyLayout: CopyLayout
  /** 目标已有同名文件时怎么处理 */
  copyConflict: CopyConflictPolicy
  /** 同时读取的目录数；运行中失败率过高会自动降档 */
  scanConcurrency: number
  /** 每批扫描的机台数 */
  scanBatchSize: number
  /** 同时复制的文件数 */
  copyConcurrency: number
  /** 每批复制的文件数 */
  copyBatchSize: number
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  copyLayout: 'flat',
  copyConflict: 'rename',
  scanConcurrency: 4,
  scanBatchSize: 2,
  copyConcurrency: 6,
  copyBatchSize: 50,
}

/**
 * 每项的可调范围。主进程按它 clamp，设置页按它画滑杆，
 * 两边共用一份，不会出现「界面允许 32、主进程悄悄压回 8」。
 */
export const PREFERENCE_RANGE = {
  scanConcurrency: { min: 1, max: 8, step: 1 },
  scanBatchSize: { min: 1, max: 4, step: 1 },
  copyConcurrency: { min: 1, max: 16, step: 1 },
  copyBatchSize: { min: 10, max: 500, step: 10 },
} as const

export interface CopyTaskParams {
  /** 要复制的机台目录名；为空表示全部 */
  machines: string[]
  layout: CopyLayout
  /** 重名策略，缺省为 rename */
  conflict: CopyConflictPolicy
}

/** 单张图片的复制失败信息，用于重试与结果展示 */
export interface CopyFailure {
  /** 相对路径，展示用 */
  path: string
  /** 源文件绝对路径 */
  from: string
  /** 目标绝对路径 */
  to: string
  reason: string
}

export interface CopyProgress {
  status: CopyStatus
  copied: number
  total: number
  failed: number
  /** 当前批次，从 1 开始 */
  batchIndex: number
  batchTotal: number
  /** 目标目录 */
  targetDir: string
  layout: CopyLayout
  /** 自动改名的数量（目标目录已有同名文件） */
  renamed: number
  /** 因目标已存在而被跳过的数量（仅 skip 策略会产生） */
  skipped: number
  /** 重名策略 */
  conflict: CopyConflictPolicy
  /** 正在复制的文件，展示用 */
  currentPath: string
  startedAt: number | null
  finishedAt: number | null
  elapsedMs: number
  /** 预计剩余毫秒，样本不足时为 null */
  etaMs: number | null
}

export interface CopyTask {
  id: string
  /** 关联的扫描任务 id，历史任务也有 */
  scanTaskId: string
  status: CopyStatus
  progress: CopyProgress
  error: string | null
  /** 失败明细，重试时按 from/to 原样再来一次 */
  failures: CopyFailure[]
  /** 生成的 source.txt 路径，完成后才有 */
  manifestPath: string | null
}

/** 复制前的预检查结果，用于在界面提示「会复制多少张、建几个子目录」 */
export interface CopyPlanPreview {
  /** 参与复制的机台 */
  machines: string[]
  total: number
  /** 按机台统计的图片数 */
  perMachine: { machine: string; images: number }[]
  /** 将要创建的子目录（相对目标目录），完全平铺时为空 */
  folders: string[]
  /**
   * 会被改名 / 跳过 / 覆盖的张数，按当前重名策略预演。
   * 让用户在选目录前就知道「这次会不会动到已有文件」。
   */
  conflicts: number
}

/**
 * 历史任务列表项。
 *
 * 只带摘要，不带 branches 与 preview —— 历史记录是每次启动都要读一遍的，
 * 二十个任务的机台列表加起来会有几百条对象，页面没展开时不需要。
 */
export interface ScanHistoryItem {
  id: string
  status: ScanTaskStatus
  params: ScanTaskParams
  /** 类别；老记录没有该字段时按 el 补齐，两个页面各看各的 */
  category: ScanCategory
  /** 命中图片数 */
  totalImages: number
  /** 有结果的机台数，用于「3/10 台命中」这类摘要 */
  hitMachines: number
  machineCount: number
  elapsedMs: number
  createdAt: number
  finishedAt: number | null
  /** 是否至少有一个分支真正探测过；0 图但有诊断的记录靠它展示 */
  diagnosed: boolean
  /** 结果明细文件是否存在；文件被删或损坏时加载会返回 null */
  restorable: boolean
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
  /** 局部更新复制与性能偏好，返回落盘后的完整配置 */
  savePreferences: (patch: Partial<AppPreferences>) => Promise<AppSettings>

  /**
   * 设置力禧特入口根目录并解析其中的 .lnk。
   * 只读入口目录，不碰机台网络 —— 入口在办公网、机台在专用内网，
   * 识别阶段去连机台只会让界面卡在超时上。
   */
  setupLxtRoot: (entryRoot: string) => Promise<LxtSetupResult>
  /** 按当前入口重新识别，与已有配置增量合并 */
  refreshLxtMachines: () => Promise<LxtSetupResult>

  /**
   * 设置利珀入口根目录并解析其中的 .lnk。
   * 与力禧特一样只读入口目录，不碰机台网络 —— 标识目录留到扫描时再探。
   */
  setupPlRoot: (entryRoot: string) => Promise<PlSetupResult>
  /** 按当前入口重新识别利珀机台 */
  refreshPlMachines: () => Promise<PlSetupResult>

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

  /**
   * 历史扫描记录，按创建时间倒序。
   * 默认只保留最近 10 次，可在历史面板里调整。
   */
  listScanHistory: () => Promise<ScanHistoryItem[]>
  /** 读取某次历史任务的完整快照（含各机台结果与前 200 条预览） */
  loadScanHistory: (taskId: string) => Promise<ScanTask | null>
  /** 删除单条历史记录，连带删除其结果文件 */
  deleteScanHistory: (taskId: string) => Promise<ScanHistoryItem[]>
  /** 清空全部历史记录 */
  clearScanHistory: () => Promise<ScanHistoryItem[]>
  /** 历史保留条数，写入配置持久化 */
  setHistoryLimit: (limit: number) => Promise<AppSettings>

  /**
   * 复制前的预检查：按勾选的机台与分组方式算出会复制多少张、建哪些子目录。
   * 界面在弹目录选择框之前调它，让用户先确认规模。
   */
  previewCopyPlan: (
    taskId: string,
    params: CopyTaskParams,
    /** 已选的目标目录；传入后才会统计会被改名 / 跳过 / 覆盖的张数 */
    targetDir?: string,
  ) => Promise<CopyPlanPreview>

  /**
   * 创建并启动复制任务。
   *
   * 必须先选好目标目录 —— 参数里的 targetDir 由调用方通过 pickDirectory 取得，
   * 主进程不再自己弹框，避免「对话框关掉了任务却已经开始」的时序问题。
   */
  startCopyTask: (
    taskId: string,
    targetDir: string,
    params: CopyTaskParams,
  ) => Promise<CopyTask>
  pauseCopyTask: (taskId: string) => Promise<CopyTask | null>
  resumeCopyTask: (taskId: string) => Promise<CopyTask | null>
  cancelCopyTask: (taskId: string) => Promise<CopyTask | null>
  /** 只重试失败的图片，已成功的不会重来 */
  retryCopyFailures: (taskId: string) => Promise<CopyTask | null>
  getCopyTask: (taskId: string) => Promise<CopyTask | null>
  /** 订阅复制任务快照变更 */
  onCopyTaskUpdate: (listener: (task: CopyTask) => void) => () => void
  /** 重新选择目标目录后，把已完成的复制任务改指向新目录并用原计划重跑 */
  copyTaskToNewDir: (
    taskId: string,
    targetDir: string,
  ) => Promise<CopyTask | null>
  /** 在系统文件管理器里打开目标目录；失败时返回可读错误，成功返回 null */
  revealCopyTarget: (targetDir: string) => Promise<string | null>

  /** 弹出另存为对话框并写入 xlsx；用户取消时返回 null */
  saveExcel: (params: {
    defaultName: string
    data: Uint8Array
  }) => Promise<string | null>
}
