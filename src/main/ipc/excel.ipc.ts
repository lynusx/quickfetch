import { dialog } from 'electron'
import { rename, rm, writeFile } from 'node:fs/promises'

import { getParentWindow } from './settings.ipc'
import { handle } from './handle'

export const registerExcelIpc = (): void => {
  handle(
    'saveExcel',
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

      const target = result.filePath
      const temp = `${target}.${process.pid}.tmp`

      try {
        await writeFile(temp, Buffer.from(params.data))
        await rename(temp, target)
      } catch (error) {
        await rm(temp, { force: true }).catch(() => undefined)
        throw error
      }

      return target
    },
  )
}
