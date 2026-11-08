import { shell } from 'electron'

import { UPDATE_RELEASE_PAGE_URL, type UpdateState } from '../../shared/ipc'
import { logger } from '../services/log'
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
} from '../services/update'
import { handle } from './handle'

export const registerUpdateIpc = (): void => {
  handle('update:get-state', (): UpdateState => getUpdateState())

  handle('update:check', (): Promise<UpdateState> =>
    checkForUpdates({ manual: true }),
  )

  handle('update:download', (): Promise<UpdateState> => downloadUpdate())

  handle('update:install', (): Promise<UpdateState> => installUpdate())

  handle('update:open-release-page', async (): Promise<string | null> => {
    try {
      await shell.openExternal(UPDATE_RELEASE_PAGE_URL)
      return null
    } catch (error) {
      logger.warn('update', 'update.open-release.failed', { error })
      return '无法打开浏览器，请手动访问 GitHub Releases 页面'
    }
  })
}
