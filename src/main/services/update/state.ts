import type { InstallMode, UpdateState } from '../../../shared/ipc'

/**
 * 自动更新的状态机。
 *
 * 纯函数，不碰 electron-updater 与窗口；主进程 service 负责把事件
 * 喂进来并广播结果，测试可以直接覆盖全部迁移。
 */
export type UpdateEvent =
  | { type: 'check-started'; manual: boolean; at: number }
  | {
      type: 'update-available'
      version: string
      releaseDate: string | null
      at: number
    }
  | { type: 'update-not-available'; at: number }
  | { type: 'download-started' }
  | {
      type: 'download-progress'
      percent: number
      transferred: number
      total: number
      bytesPerSecond: number
    }
  | { type: 'downloaded' }
  | { type: 'install-started' }
  | { type: 'tasks'; blocked: boolean; reason: string | null }
  | {
      type: 'failed'
      stage: 'check' | 'download' | 'install'
      message: string
      at?: number
    }
  | { type: 'disabled'; message: string }
  | { type: 'reset'; currentVersion: string; installMode: InstallMode }

export const initialState = (
  currentVersion: string,
  installMode: InstallMode,
  message: string | null = null,
): UpdateState => ({
  phase: 'idle',
  installMode,
  currentVersion,
  availableVersion: null,
  releaseDate: null,
  percent: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
  lastCheckedAt: null,
  lastCheckManual: false,
  message,
  error: null,
  blockedByTasks: false,
  blockedReason: null,
  canInstall: false,
})

const canInstallNow = (state: UpdateState, blocked: boolean): boolean =>
  state.installMode === 'installed' && state.phase === 'downloaded' && !blocked

export interface TaskBlock {
  blocked: boolean
  reason: string | null
}

/** 纯判断，方便回归测试；运行中任务会阻止重启安装 */
export const describeTaskBlock = (scan: boolean, copy: boolean): TaskBlock => {
  if (scan && copy) {
    return {
      blocked: true,
      reason: '扫描和复制任务正在进行，请等任务结束后再安装',
    }
  }

  if (scan) {
    return {
      blocked: true,
      reason: '扫描任务正在进行，请等任务结束后再安装',
    }
  }

  if (copy) {
    return {
      blocked: true,
      reason: '复制任务正在进行，请等任务结束后再安装',
    }
  }

  return { blocked: false, reason: null }
}

export const reduceUpdateState = (
  state: UpdateState,
  event: UpdateEvent,
): UpdateState => {
  switch (event.type) {
    case 'check-started':
      return {
        ...state,
        phase: 'checking',
        lastCheckManual: event.manual,
        lastCheckedAt: event.at,
        availableVersion: null,
        releaseDate: null,
        percent: 0,
        transferred: 0,
        total: 0,
        bytesPerSecond: 0,
        message: '正在检查更新…',
        error: null,
        canInstall: false,
      }

    case 'update-available':
      return {
        ...state,
        phase: 'available',
        availableVersion: event.version,
        releaseDate: event.releaseDate,
        lastCheckedAt: event.at,
        message: `发现新版本 v${event.version}`,
        error: null,
        canInstall: false,
      }

    case 'update-not-available':
      return {
        ...state,
        phase: 'up-to-date',
        availableVersion: null,
        releaseDate: null,
        lastCheckedAt: event.at,
        message: '已是最新版本',
        error: null,
        canInstall: false,
      }

    case 'download-started':
      return {
        ...state,
        phase: 'downloading',
        percent: 0,
        transferred: 0,
        total: 0,
        bytesPerSecond: 0,
        message: '正在下载更新…',
        error: null,
        canInstall: false,
      }

    case 'download-progress':
      return {
        ...state,
        phase: 'downloading',
        percent: Math.min(100, Math.max(0, Math.round(event.percent))),
        transferred: event.transferred,
        total: event.total,
        bytesPerSecond: event.bytesPerSecond,
      }

    case 'downloaded':
      return {
        ...state,
        phase: 'downloaded',
        percent: 100,
        canInstall: canInstallNow(
          { ...state, phase: 'downloaded' },
          state.blockedByTasks,
        ),
        message: state.availableVersion
          ? `更新 v${state.availableVersion} 已下载`
          : '更新已下载',
        error: null,
      }

    case 'install-started':
      return {
        ...state,
        phase: 'installing',
        canInstall: false,
        message: '正在退出并安装更新…',
      }

    case 'tasks':
      return {
        ...state,
        blockedByTasks: event.blocked,
        blockedReason: event.reason,
        canInstall: canInstallNow(state, event.blocked),
      }

    case 'failed':
      return {
        ...state,
        phase: 'error',
        error: event.message,
        message: null,
        canInstall: false,
        availableVersion:
          event.stage === 'check' ? null : state.availableVersion,
        lastCheckedAt: event.at ?? state.lastCheckedAt,
      }

    case 'disabled':
      return {
        ...state,
        phase: 'disabled',
        message: event.message,
        canInstall: false,
      }

    case 'reset':
      return initialState(event.currentVersion, event.installMode)
  }
}
