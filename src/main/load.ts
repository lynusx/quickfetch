/**
 * 现场机器资源档位。
 *
 * 常规值在设置页里调、存进 settings.json；这里只负责把环境变量叠上去，
 * 供现场出问题时临时压降（改环境变量比重装一遍快）。
 *
 * 优先级：环境变量 > 设置页 > 默认值
 */
import type { AppPreferences, PreferenceKey, ScanCategory } from '../shared/ipc'
import { DEFAULT_PREFERENCES, PREFERENCE_ENV } from '../shared/ipc'

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** 哪几项正在被环境变量接管，供设置页把输入框标灰 */
export const envOverriddenKeys = (): PreferenceKey[] =>
  (Object.keys(PREFERENCE_ENV) as PreferenceKey[]).filter((key) => {
    const raw = process.env[PREFERENCE_ENV[key]]
    if (!raw) return false
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0
  })

export interface LoadProfile {
  /** 同时进行的目录读取数 */
  readConcurrency: number
  /** 每批并行扫描的机台数 */
  machineBatchSize: number
  /** 同时复制的文件数 */
  copyConcurrency: number
  /** 每批复制的文件数 */
  copyBatchSize: number
}

const pick = (env: keyof typeof PREFERENCE_ENV, fallback: number): number =>
  toInt(process.env[PREFERENCE_ENV[env]], fallback)

/**
 * 按类别取扫描档位。
 *
 * 力禧特 45 台机器各走一个 IP、又在另一张专用内网上，跟 EL 的十台
 * 共享一个根完全不是一回事，所以并发与批量各存一份；复制档位两类共用。
 */
export const loadFrom = (
  preferences: AppPreferences,
  category: ScanCategory = 'el',
): LoadProfile => ({
  readConcurrency:
    category === 'lxt'
      ? pick('lxtScanConcurrency', preferences.lxtScanConcurrency)
      : pick('scanConcurrency', preferences.scanConcurrency),
  machineBatchSize:
    category === 'lxt'
      ? pick('lxtScanBatchSize', preferences.lxtScanBatchSize)
      : pick('scanBatchSize', preferences.scanBatchSize),
  copyConcurrency: pick('copyConcurrency', preferences.copyConcurrency),
  copyBatchSize: pick('copyBatchSize', preferences.copyBatchSize),
})

/** 没有配置时的兜底档位，与 DEFAULT_PREFERENCES 一致 */
export const defaultLoad = (): LoadProfile =>
  loadFrom({ ...DEFAULT_PREFERENCES })
