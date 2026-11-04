import type { ScanHistoryItem } from '../../shared/ipc'
import {
  clearRecords,
  deleteRecord,
  getTask,
  listHistory,
  readRecord,
  toTask,
  trimRecords,
} from '../services/scanner'
import { saveHistoryLimit } from '../services/settings'
import { handle } from './handle'

export const registerHistoryIpc = (): void => {
  handle('history:list', (): Promise<ScanHistoryItem[]> => listHistory())

  handle('history:load', async (_event, taskId: string) => {
    const live = getTask(taskId)
    if (live) return live

    const record = await readRecord(taskId)
    return record ? toTask(record) : null
  })

  handle('history:delete', async (_event, taskId: string) => {
    await deleteRecord(taskId)
    return listHistory()
  })

  handle('history:clear', async () => {
    await clearRecords()
    return listHistory()
  })

  handle('history:set-limit', async (_event, limit: number) => {
    const settings = await saveHistoryLimit(limit)
    await trimRecords(settings.historyLimit)
    return settings
  })
}
