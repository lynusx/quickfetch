import { serializeLogValue } from '../services/log/format'

/**
 * IPC 参数摘要：只保留排障需要的小字段。
 *
 * 大数组转 `{count, sample}`，Uint8Array 只留字节数，路径截断到 300 字符；
 * 未知通道走浅序列化，最终 JSON 超过 4 KB 只留 `{__truncated:true}`。
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
  channel: string,
  args: readonly unknown[],
): Record<string, unknown> => {
  switch (channel) {
    case 'scan:create':
      return paramsSummary(args[0])
    case 'scan:start':
    case 'scan:pause':
    case 'scan:resume':
    case 'scan:cancel':
    case 'scan:get':
      return { taskId: args[0] }
    case 'scan:images':
      return { taskId: args[0], offset: args[1], limit: args[2] }
    case 'history:load':
    case 'history:delete':
      return { taskId: args[0] }
    case 'history:set-limit':
      return { limit: args[0] }
    case 'history:list':
    case 'history:clear':
    case 'settings:read':
    case 'settings:refresh':
    case 'app:version':
    case 'logs:info':
    case 'logs:open':
      return {}
    case 'settings:save-root':
      return { rootPath: truncatePath(args[0]) }
    case 'settings:save-preferences': {
      const patch = asRecord(args[0])

      return { keys: Object.keys(patch), values: patch }
    }
    case 'lxt:setup-root':
    case 'pl:setup-root':
    case 'aoi:setup-root':
      return { entryRoot: truncatePath(args[0]) }
    case 'lxt:refresh':
    case 'pl:refresh':
    case 'aoi:refresh':
      return {}
    case 'share:reprobe':
      return { category: args[0], keys: sample(args[1]) }
    case 'copy:preview':
      return copyParamsSummary(args[1], {
        taskId: args[0],
        targetDir: truncatePath(args[2]),
      })
    case 'copy:start':
      return copyParamsSummary(args[2], {
        taskId: args[0],
        targetDir: truncatePath(args[1]),
      })
    case 'copy:to-new-dir':
      return { copyId: args[0], targetDir: truncatePath(args[1]) }
    case 'copy:reveal':
      return { targetDir: truncatePath(args[0]) }
    case 'copy:pause':
    case 'copy:resume':
    case 'copy:cancel':
    case 'copy:retry':
    case 'copy:get':
      return { copyId: args[0] }
    case 'fs:pick-directory':
      return { title: asRecord(args[0]).title }
    case 'fs:save-excel': {
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
  channel: string,
  args: readonly unknown[],
): Record<string, unknown> => {
  try {
    const summary = buildSummary(channel, args)
    const json = JSON.stringify(summary)

    return json && json.length > MAX_SUMMARY_CHARS
      ? { __truncated: true }
      : summary
  } catch {
    return { __unserializable: true }
  }
}
