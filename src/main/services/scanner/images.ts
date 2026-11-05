import type { ScannedImage } from '../../../shared/ipc'

import { readRecord } from './history'
import { getRunner } from './registry'

/**
 * 一个扫描任务的图片集合：活的任务读内存，已结束的读历史记录。
 *
 * 以前 scan:images 与 copy:preview/copy:start 各自写一遍这个查找，
 * 新增第三处调用时很容易只取内存或只取历史。这里统一成一个 lookup。
 */
export const taskImages = async (taskId: string): Promise<ScannedImage[]> => {
  const runner = getRunner(taskId)

  if (runner) return runner.getImages()

  return (await readRecord(taskId))?.images ?? []
}

export interface TaskImagePage {
  images: ScannedImage[]
  total: number
}

/** 分页读取；offset/limit 只影响返回，不改变全量来源 */
export const taskImagePage = async (
  taskId: string,
  offset: number,
  limit: number,
): Promise<TaskImagePage> => {
  const all = await taskImages(taskId)

  return {
    images: all.slice(offset, offset + limit),
    total: all.length,
  }
}
