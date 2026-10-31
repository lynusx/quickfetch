import { registerSettingsIpc } from './settings.ipc'
import { registerScanIpc } from './scan.ipc'
import { registerCopyIpc } from './copy.ipc'
import { registerHistoryIpc } from './history.ipc'
import { registerExcelIpc } from './excel.ipc'

export const registerIpcHandlers = (): void => {
  registerSettingsIpc()
  registerScanIpc()
  registerCopyIpc()
  registerHistoryIpc()
  registerExcelIpc()
}
