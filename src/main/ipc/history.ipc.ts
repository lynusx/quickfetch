import { ipcMain } from 'electron'

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

export const registerHistoryIpc = (): void => {
  ipcMain.handle('history:list', (): Promise<ScanHistoryItem[]> =>
    listHistory(),
  )

  ipcMain.handle('history:load', async (_event, taskId: string) => {
    const live = getTask(taskId)
    if (live) return live

    const record = await readRecord(taskId)
    return record ? toTask(record) : null
  })

  ipcMain.handle('history:delete', async (_event, taskId: string) => {
    await deleteRecord(taskId)
    return listHistory()
  })

  ipcMain.handle('history:clear', async () => {
    await clearRecords()
    return listHistory()
  })

  ipcMain.handle('history:set-limit', async (_event, limit: number) => {
    const settings = await saveHistoryLimit(limit)
    await trimRecords(settings.historyLimit)
    return settings
  })
}
