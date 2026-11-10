import { serializeLogValue } from '../services/log/format'
import type { IpcInvokeMethod } from '../../shared/ipc'

/**
 * IPC 参数摘要：只保留排障需要的小字段。
 *
 * 大数组转 `{count, sample}`，Uint8Array 只留字节数，路径截断到 300 字符；
 * 没有专门规则的方法走浅序列化，最终 JSON 超过 4 KB 只留 `{__truncated:true}`。
 *
 * 入参是方法名而不是通道字符串：与 `handle()` 共用同一张描述表，
 * 漏写或拼错在编译期就能发现。
 */

const MAX_PATH_CHARS = 300
const MAX_SUMMARY_CHARS = 4096

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const truncatePath = (value: unknown): unknown =>
  typeof value === 'string' && value.length > MAX_PATH_CHARS
    ? `${value.slice(0, MAX_PATH_CHARS)}…(+${value.length - MAX_PATH_CHARS})`
    : value

const sample = (value: unknown): unknown =>
  Array.isArray(value)
    ? { count: value.length, sample: value.slice(0, 5) }
    : value

const paramsSummary = (value: unknown): Record<string, unknown> => {
  const params = asRecord(value)

  return {
    category: params.category,
    date: params.date,
    shift: params.shift,
    machines: sample(params.machines),
    slots: sample(params.slots),
    types: sample(params.types),
    levels: sample(params.levels),
    aoiImageKind: params.aoiImageKind,
  }
}

const copyParamsSummary = (
  paramsValue: unknown,
  extra: Record<string, unknown>,
): Record<string, unknown> => {
  const params = asRecord(paramsValue)

  return {
    ...extra,
    layout: params.layout,
    conflict: params.conflict,
    machines: sample(params.machines),
  }
}

const buildSummary = (
  method: IpcInvokeMethod,
  args: readonly unknown[],
): Record<string, unknown> => {
  switch (method) {
    case 'createScanTask':
      return paramsSummary(args[0])
    case 'startScanTask':
    case 'pauseScanTask':
    case 'resumeScanTask':
    case 'cancelScanTask':
    case 'getScanTask':
      return { taskId: args[0] }
    case 'getScanTaskImages':
      return { taskId: args[0], offset: args[1], limit: args[2] }
    case 'loadScanHistory':
    case 'deleteScanHistory':
      return { taskId: args[0] }
    case 'setHistoryLimit':
      return { limit: args[0] }
    case 'listScanHistory':
    case 'clearScanHistory':
    case 'readSettings':
    case 'getSettingsPath':
    case 'refreshMachines':
    case 'getVersion':
    case 'getLogInfo':
    case 'openLogDir':
    case 'getUpdateState':
    case 'checkForUpdates':
    case 'downloadUpdate':
    case 'installUpdate':
    case 'openUpdateReleasePage':
      return {}
    case 'saveRootPath':
      return { rootPath: truncatePath(args[0]) }
    case 'savePreferences': {
      const patch = asRecord(args[0])

      return { keys: Object.keys(patch), values: patch }
    }
    case 'setupLxtRoot':
    case 'setupPlRoot':
    case 'setupAoiRoot':
      return { entryRoot: truncatePath(args[0]) }
    case 'refreshLxtMachines':
    case 'refreshPlMachines':
    case 'refreshAoiMachines':
      return {}
    case 'reprobeShares':
      return { category: args[0], keys: sample(args[1]) }
    case 'previewCopyPlan':
      return copyParamsSummary(args[1], {
        taskId: args[0],
        targetDir: truncatePath(args[2]),
      })
    case 'startCopyTask':
      return copyParamsSummary(args[2], {
        taskId: args[0],
        targetDir: truncatePath(args[1]),
      })
    case 'revealCopyTarget':
      return { targetDir: truncatePath(args[0]) }
    case 'pauseCopyTask':
    case 'resumeCopyTask':
    case 'cancelCopyTask':
    case 'retryCopyFailures':
    case 'getCopyTask':
      return { copyId: args[0] }
    case 'pickDirectory':
      return { title: asRecord(args[0]).title }
    case 'saveExcel': {
      const params = asRecord(args[0])
      const data = params.data

      return {
        defaultName: params.defaultName,
        dataBytes: ArrayBuffer.isView(data) ? data.byteLength : undefined,
      }
    }
    default:
      return {
        args: args.map((arg) =>
          serializeLogValue(arg, {
            maxDepth: 2,
            maxArray: 5,
            maxString: 200,
            maxKeys: 12,
          }),
        ),
      }
  }
}

export const summarizeIpcArgs = (
  method: IpcInvokeMethod,
  args: readonly unknown[],
): Record<string, unknown> => {
  try {
    const summary = buildSummary(method, args)
    const json = JSON.stringify(summary)

    return json && json.length > MAX_SUMMARY_CHARS
      ? { __truncated: true }
      : summary
  } catch {
    return { __unserializable: true }
  }
}
