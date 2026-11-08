import { BrowserWindow, app } from 'electron'
import { autoUpdater } from 'electron-updater'

import type { AppPreferences, UpdateState } from '../../../shared/ipc'
import { onActivityChange } from '../../utils/activity'
import { logger } from '../log'
import { flushScanPersistence } from '../scanner/registry'
import { flushSettingsWrites } from '../settings'
import { detectInstallMode } from './installMode'
import { initialState, reduceUpdateState } from './state'
import { getTaskBlock } from './taskGate'

/** 启动后延迟检查：让窗口先完成首屏，避免和设置读盘、日志初始化抢资源 */
const AUTO_CHECK_DELAY_MS = 10_000
const TASK_RECOMPUTE_DELAY_MS = 250
const INSTALL_FALLBACK_MS = 15_000

let state: UpdateState = initialState(app.getVersion(), 'portable')
let preferences: AppPreferences | null = null
let autoCheckTimer: NodeJS.Timeout | null = null
let taskRecomputeTimer: NodeJS.Timeout | null = null
let installFallbackTimer: NodeJS.Timeout | null = null
let unsubscribeActivity: (() => void) | null = null
let listenersAttached = false
let installing = false

const broadcast = (): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('update:state', state)
    }
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const clearAutoCheck = (): void => {
  if (!autoCheckTimer) return

  clearTimeout(autoCheckTimer)
  autoCheckTimer = null
}

const clearInstallFallback = (): void => {
  if (!installFallbackTimer) return

  clearTimeout(installFallbackTimer)
  installFallbackTimer = null
}

const isCancellationError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'CancellationError' || /cancell?ed/i.test(error.message))

const describeUpdateError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)

  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|net::/i.test(message)) {
    return '无法连接 GitHub Releases，请检查网络后重试'
  }

  if (/404|CHANNEL_FILE_NOT_FOUND/i.test(message)) {
    return 'Release 上缺少更新信息（latest.yml），请确认发版资产完整'
  }

  if (/sha512|checksum|integrity/i.test(message)) {
    return '更新包校验失败，请重新下载'
  }

  if (/EACCES|EPERM/i.test(message)) {
    return '没有权限写入更新缓存，请检查目录权限'
  }

  return `更新失败：${message}`
}

const refreshTaskBlock = (): void => {
  const block = getTaskBlock()

  state = reduceUpdateState(state, {
    type: 'tasks',
    blocked: block.blocked,
    reason: block.reason,
  })
}

const scheduleTaskRecompute = (): void => {
  if (taskRecomputeTimer) return

  taskRecomputeTimer = setTimeout(() => {
    taskRecomputeTimer = null

    const block = getTaskBlock()

    if (
      block.blocked === state.blockedByTasks &&
      block.reason === state.blockedReason
    ) {
      return
    }

    state = reduceUpdateState(state, {
      type: 'tasks',
      blocked: block.blocked,
      reason: block.reason,
    })
    broadcast()
  }, TASK_RECOMPUTE_DELAY_MS)

  taskRecomputeTimer.unref?.()
}

const scheduleAutoCheck = (): void => {
  clearAutoCheck()

  if (!app.isPackaged || preferences?.updateAutoCheckEnabled !== true) return

  autoCheckTimer = setTimeout(() => {
    autoCheckTimer = null
    void checkForUpdates({ manual: false })
  }, AUTO_CHECK_DELAY_MS)

  autoCheckTimer.unref?.()
}

const attachUpdaterListeners = (): void => {
  if (listenersAttached) return

  listenersAttached = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = {
    info: (message?: unknown) =>
      logger.info('update', 'updater.info', { message: String(message ?? '') }),
    warn: (message?: unknown) =>
      logger.warn('update', 'updater.warn', { message: String(message ?? '') }),
    error: (message?: unknown) =>
      logger.error('update', 'updater.error', {
        message: String(message ?? ''),
      }),
    debug: (message?: unknown) =>
      logger.debug('update', 'updater.debug', {
        message: String(message ?? ''),
      }),
  }

  autoUpdater.on('update-available', (info) => {
    if (state.phase !== 'checking') return

    state = reduceUpdateState(state, {
      type: 'update-available',
      version: info.version,
      releaseDate: info.releaseDate ?? null,
      at: Date.now(),
    })
    logger.info('update', 'update.available', { version: info.version })
    broadcast()
  })

  autoUpdater.on('update-not-available', () => {
    if (state.phase !== 'checking') return

    state = reduceUpdateState(state, {
      type: 'update-not-available',
      at: Date.now(),
    })
    logger.info('update', 'update.not-available', {})
    broadcast()
  })

  autoUpdater.on('download-progress', (progress) => {
    if (state.phase !== 'downloading') return

    state = reduceUpdateState(state, {
      type: 'download-progress',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
    broadcast()
  })

  autoUpdater.on('update-downloaded', () => {
    if (state.phase !== 'downloading') return

    const block = getTaskBlock()

    state = reduceUpdateState(state, { type: 'downloaded' })
    state = reduceUpdateState(state, {
      type: 'tasks',
      blocked: block.blocked,
      reason: block.reason,
    })
    logger.info('update', 'update.downloaded', {
      version: state.availableVersion,
    })
    broadcast()
  })

  autoUpdater.on('error', (error) => {
    if (isCancellationError(error)) return

    if (state.phase === 'installing') {
      installing = false
      clearInstallFallback()
    }

    if (
      state.phase !== 'checking' &&
      state.phase !== 'downloading' &&
      state.phase !== 'installing'
    ) {
      return
    }

    const stage =
      state.phase === 'downloading'
        ? 'download'
        : state.phase === 'installing'
          ? 'install'
          : 'check'

    logger.warn('update', 'update.error', { error, stage })
    state = reduceUpdateState(state, {
      type: 'failed',
      stage,
      message: describeUpdateError(error),
    })
    broadcast()
  })
}

export const initUpdateService = (
  nextPreferences: AppPreferences | null,
): void => {
  preferences = nextPreferences
  state = initialState(app.getVersion(), detectInstallMode())

  attachUpdaterListeners()
  unsubscribeActivity ??= onActivityChange(scheduleTaskRecompute)
  refreshTaskBlock()

  if (!app.isPackaged) {
    state = reduceUpdateState(state, {
      type: 'disabled',
      message: '开发模式或未打包版本不支持自动更新',
    })
    return
  }

  if (!nextPreferences) {
    state = {
      ...state,
      message: '配置读取失败，未自动检查更新',
    }
    return
  }

  scheduleAutoCheck()
}

export const applyUpdatePreferences = (next: AppPreferences): void => {
  preferences = next

  if (!app.isPackaged || installing) return

  if (next.updateAutoCheckEnabled) {
    if (
      state.phase === 'idle' ||
      state.phase === 'up-to-date' ||
      state.phase === 'error'
    ) {
      scheduleAutoCheck()
    }
    return
  }

  clearAutoCheck()
}

export const getUpdateState = (): UpdateState => state

export const isInstallingUpdate = (): boolean => installing

export const checkForUpdates = async (
  options: { manual?: boolean } = {},
): Promise<UpdateState> => {
  if (!app.isPackaged) {
    state = reduceUpdateState(state, {
      type: 'disabled',
      message: '开发模式或未打包版本不支持自动更新',
    })
    broadcast()
    return state
  }

  if (
    installing ||
    state.phase === 'checking' ||
    state.phase === 'downloading' ||
    state.phase === 'downloaded'
  ) {
    return state
  }

  clearAutoCheck()

  state = reduceUpdateState(state, {
    type: 'check-started',
    manual: options.manual === true,
    at: Date.now(),
  })
  broadcast()
  logger.info('update', 'update.check.start', {
    manual: options.manual === true,
  })

  try {
    const result = await autoUpdater.checkForUpdates()

    if (!result) {
      state = reduceUpdateState(state, {
        type: 'disabled',
        message: '更新器未启用',
      })
      broadcast()
    }
  } catch (error) {
    if (isCancellationError(error)) return state

    logger.warn('update', 'update.check.failed', { error })
    state = reduceUpdateState(state, {
      type: 'failed',
      stage: 'check',
      message: describeUpdateError(error),
      at: Date.now(),
    })
    broadcast()
  }

  return state
}

export const downloadUpdate = async (): Promise<UpdateState> => {
  if (state.installMode !== 'installed') return state
  if (state.phase !== 'available') return state

  state = reduceUpdateState(state, { type: 'download-started' })
  broadcast()
  logger.info('update', 'update.download.start', {
    version: state.availableVersion,
  })

  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    if (isCancellationError(error)) return state

    logger.warn('update', 'update.download.failed', { error })
    state = reduceUpdateState(state, {
      type: 'failed',
      stage: 'download',
      message: describeUpdateError(error),
    })
    broadcast()
  }

  return state
}

export const installUpdate = async (): Promise<UpdateState> => {
  if (state.installMode !== 'installed') return state
  if (state.phase !== 'downloaded' || installing) return state

  const block = getTaskBlock()

  if (block.blocked) {
    state = reduceUpdateState(state, {
      type: 'tasks',
      blocked: true,
      reason: block.reason,
    })
    logger.info('update', 'update.install.blocked', { reason: block.reason })
    broadcast()
    return state
  }

  // 安装会直接退出进程：等历史落盘与设置写队列收尾，最多 3 秒
  await Promise.race([
    Promise.all([flushScanPersistence(3000), flushSettingsWrites()]),
    delay(3000),
  ]).catch(() => undefined)

  logger.info('update', 'update.install.start', {
    version: state.availableVersion,
  })
  await logger.flush().catch(() => undefined)

  installing = true
  state = reduceUpdateState(state, { type: 'install-started' })
  broadcast()

  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(false, true)
    } catch (error) {
      installing = false
      clearInstallFallback()
      logger.error('update', 'update.install.failed', { error })
      state = reduceUpdateState(state, {
        type: 'failed',
        stage: 'install',
        message: '安装程序启动失败，请重试或打开下载页面手动安装',
      })
      broadcast()
    }
  }, 200)

  installFallbackTimer = setTimeout(() => {
    if (!installing) return

    installing = false
    logger.warn('update', 'update.install.timeout', {})
    state = reduceUpdateState(state, {
      type: 'failed',
      stage: 'install',
      message: '安装程序未启动，请打开下载页面手动安装',
    })
    broadcast()
  }, INSTALL_FALLBACK_MS)

  installFallbackTimer.unref?.()

  return state
}

export const disposeUpdateService = (): void => {
  clearAutoCheck()
  clearInstallFallback()

  if (taskRecomputeTimer) {
    clearTimeout(taskRecomputeTimer)
    taskRecomputeTimer = null
  }

  unsubscribeActivity?.()
  unsubscribeActivity = null
}
