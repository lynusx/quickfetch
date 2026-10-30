/**
 * 历史扫描记录的保留策略。
 *
 * 单独放一个文件是为了避免 settings.ts 与 scanner/history.ts 互相 import：
 * 前者要校验条数上限，后者要实现裁剪，抽出来两边都只依赖这里。
 */
export const DEFAULT_HISTORY_LIMIT = 10

/**
 * 上限别放太开：结果文件包含全部图片绝对路径，
 * 单次任务几千张图就是几百 KB 到几 MB，留太多会拖慢启动时的列表读取。
 */
export const MAX_HISTORY_LIMIT = 50

/** 把任意输入收进合法区间，误填 0 或负数也不会把历史功能关死 */
export const normalizeHistoryLimit = (value: unknown): number => {
  const parsed =
    typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)

  if (!Number.isFinite(parsed)) return DEFAULT_HISTORY_LIMIT

  return Math.max(1, Math.min(MAX_HISTORY_LIMIT, Math.round(parsed)))
}
