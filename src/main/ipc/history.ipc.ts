import type { ScanHistoryItem } from '../../shared/ipc'
import { getArchive } from '../services/scanner'
import { saveHistoryLimit } from '../services/settings'
import { handle } from './handle'

export const registerHistoryIpc = (): void => {
  handle('listScanHistory', (): Promise<ScanHistoryItem[]> =>
    getArchive().list(),
  )

  handle('loadScanHistory', (_event, taskId: string) =>
    getArchive().load(taskId),
  )

  handle('deleteScanHistory', async (_event, taskId: string) => {
    const archive = getArchive()

    await archive.remove(taskId)
    return archive.list()
  })

  handle('clearScanHistory', async () => {
    const archive = getArchive()

    await archive.clear()
    return archive.list()
  })

  handle('setHistoryLimit', async (_event, limit: number) => {
    const settings = await saveHistoryLimit(limit)

    await getArchive().trim(settings.historyLimit)
    return settings
  })
}
