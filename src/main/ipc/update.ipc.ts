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
  handle('getUpdateState', (): UpdateState => getUpdateState())

  handle('checkForUpdates', (): Promise<UpdateState> =>
    checkForUpdates({ manual: true }),
  )

  handle('downloadUpdate', (): Promise<UpdateState> => downloadUpdate())

  handle('installUpdate', (): Promise<UpdateState> => installUpdate())

  handle('openUpdateReleasePage', async (): Promise<string | null> => {
    try {
      await shell.openExternal(UPDATE_RELEASE_PAGE_URL)
      return null
    } catch (error) {
      logger.warn('update', 'update.open-release.failed', { error })
      return '无法打开浏览器，请手动访问 GitHub Releases 页面'
    }
  })
}
