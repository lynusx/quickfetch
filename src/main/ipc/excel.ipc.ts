import { dialog } from 'electron'
import { writeFile } from 'node:fs/promises'

import { getParentWindow } from './settings.ipc'
import { handle } from './handle'

export const registerExcelIpc = (): void => {
  handle(
    'fs:save-excel',
    async (
      event,
      params: { defaultName: string; data: Uint8Array },
    ): Promise<string | null> => {
      const parent = getParentWindow(event.sender)
      const saveOptions = {
        title: '导出 Excel',
        defaultPath: params.defaultName,
        filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
      }

      const result = parent
        ? await dialog.showSaveDialog(parent, saveOptions)
        : await dialog.showSaveDialog(saveOptions)

      if (result.canceled || !result.filePath) return null

      await writeFile(result.filePath, Buffer.from(params.data))

      return result.filePath
    },
  )
}
