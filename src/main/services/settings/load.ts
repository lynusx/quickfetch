/**
 * 现场机器资源档位。
 *
 * 常规值在设置页里调、存进 settings.json；这里只负责把环境变量叠上去，
 * 供现场出问题时临时压降（改环境变量比重装一遍快）。
 *
 * 优先级：环境变量 > 设置页 > 默认值
 */
import type { AppPreferences, PreferenceKey } from '../../../shared/ipc'
import { PREFERENCE_ENV } from '../../../shared/ipc'

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
 * 取扫描与复制档位。
 *
 * EL / 力禧特 / 利珀 / 森标 AOI 共用同一套设置：四类扫描都从这份偏好读取，
 * 现场只有一套机器资源，分开配反而容易出现一边过载、一边闲置。
 */
export const loadFrom = (preferences: AppPreferences): LoadProfile => ({
  readConcurrency: pick('scanConcurrency', preferences.scanConcurrency),
  machineBatchSize: pick('scanBatchSize', preferences.scanBatchSize),
  copyConcurrency: pick('copyConcurrency', preferences.copyConcurrency),
  copyBatchSize: pick('copyBatchSize', preferences.copyBatchSize),
})
