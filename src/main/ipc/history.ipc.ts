import type { ScanHistoryItem } from '../../shared/ipc'
import { getArchive } from '../services/scanner'
import { saveHistoryLimit } from '../services/settings'
import { handle } from './handle'

export const registerHistoryIpc = (): void => {
  handle('history:list', (): Promise<ScanHistoryItem[]> => getArchive().list())

  handle('history:load', (_event, taskId: string) => getArchive().load(taskId))

  handle('history:delete', async (_event, taskId: string) => {
    const archive = getArchive()

    await archive.remove(taskId)
    return archive.list()
  })

  handle('history:clear', async () => {
    const archive = getArchive()

    await archive.clear()
    return archive.list()
  })

  handle('history:set-limit', async (_event, limit: number) => {
    const settings = await saveHistoryLimit(limit)

    await getArchive().trim(settings.historyLimit)
    return settings
  })
}
