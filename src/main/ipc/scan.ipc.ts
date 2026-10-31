import { ipcMain } from 'electron'

import type {
  AppSettings,
  LxtShare,
  ScanTask,
  ScanTaskParams,
} from '../../shared/ipc'
import {
  createElResolver,
  createLxtResolver,
  createPlResolver,
} from '../services/scanner/resolver'
import type { MachineResolver } from '../services/scanner/resolver'
import {
  createTask,
  getRunner,
  getTask,
  readRecord,
  startTask,
} from '../services/scanner'
import {
  readSettings,
  rememberLxtShare,
  rememberPlShare,
  loadFrom,
} from '../services/settings'

const requireRunner = (taskId: string) => {
  const runner = getRunner(taskId)

  if (!runner) {
    throw new Error('任务不存在或已被清理，请重新创建扫描任务')
  }

  return runner
}

const validateParams = (params: ScanTaskParams): void => {
  if (!params.machines.length) {
    throw new Error('请至少选择一个机台')
  }
  if (!/^\d{8}$/.test(params.date)) {
    throw new Error('日期格式不正确，应为 YYYYMMDD')
  }
  if (!params.slots.length) {
    throw new Error('请至少选择一个时段')
  }
  if (!params.types.length) {
    throw new Error('请至少选择一个不良类型')
  }
}

const createLxtTask = (
  settings: AppSettings,
  params: ScanTaskParams,
): ScanTask => {
  const active = settings.lxt.machines.filter((item) => !item.stale)
  const known = new Set(active.map((item) => item.key))
  const machines = params.machines.filter((key) => known.has(key))

  if (!machines.length) {
    throw new Error('所选机台已不在入口目录中，请点击「重新识别」刷新机台列表')
  }

  const hosts = new Map(active.map((item) => [item.key, item.host]))
  const shares = new Map<string, LxtShare | null>(
    active.map((item) => [item.key, item.share]),
  )

  const resolver: MachineResolver = createLxtResolver({
    hosts,
    shares,
    onShare: (machine, share, host) => {
      void rememberLxtShare(machine, share, host)
    },
  })

  return createTask(
    { ...params, category: 'lxt', machines },
    {
      category: 'lxt',
      resolver,
      load: loadFrom(settings.preferences, 'lxt'),
    },
  )
}

const createPlTask = (
  settings: AppSettings,
  params: ScanTaskParams,
): ScanTask => {
  const active = settings.pl.machines.filter((item) => !item.stale)
  const known = new Set(active.map((item) => item.key))
  const machines = params.machines.filter((key) => known.has(key))

  if (!machines.length) {
    throw new Error('所选机台已不在入口目录中，请点击「重新识别」刷新机台列表')
  }

  const hosts = new Map(active.map((item) => [item.key, item.host]))
  const shares = new Map<string, string | null>(
    active.map((item) => [item.key, item.share]),
  )

  const resolver: MachineResolver = createPlResolver({
    hosts,
    shares,
    onShare: (machine, share, host) => {
      void rememberPlShare(machine, share, host)
    },
  })

  return createTask(
    { ...params, category: 'pl', machines },
    {
      category: 'pl',
      resolver,
      load: loadFrom(settings.preferences, 'pl'),
    },
  )
}

export const registerScanIpc = (): void => {
  ipcMain.handle('scan:create', async (_event, params: ScanTaskParams) => {
    validateParams(params)
    const settings = await readSettings()
    const category = params.category ?? 'el'

    if (category === 'lxt') {
      return createLxtTask(settings, params)
    }

    if (category === 'pl') {
      return createPlTask(settings, params)
    }

    if (!settings.rootPath) {
      throw new Error('尚未配置 DC 根目录，请先填写或选择根目录路径')
    }

    const known = new Set(settings.machines.map((item) => item.name))
    const machines = params.machines.filter((name) => known.has(name))

    if (!machines.length) {
      throw new Error('所选机台已不存在，请点击「重新识别」刷新机台列表')
    }

    const resolver = createElResolver(settings.rootPath, settings.entry)

    return createTask(
      { ...params, category: 'el', machines },
      {
        category: 'el',
        resolver,
        load: loadFrom(settings.preferences, 'el'),
      },
    )
  })

  // 启动走 registry.startTask：它在任务结束后负责把结果写入历史
  ipcMain.handle('scan:start', (_event, taskId: string): ScanTask => {
    const task = startTask(taskId)

    if (!task) throw new Error('任务不存在或已过期，请重新开始扫描')

    return task
  })

  ipcMain.handle('scan:pause', (_event, taskId: string) =>
    requireRunner(taskId).pause('user'),
  )

  ipcMain.handle('scan:resume', (_event, taskId: string) =>
    requireRunner(taskId).resume(),
  )

  ipcMain.handle('scan:cancel', (_event, taskId: string) =>
    requireRunner(taskId).cancel(),
  )

  ipcMain.handle('scan:get', (_event, taskId: string) => getTask(taskId))

  ipcMain.handle(
    'scan:images',
    async (_event, taskId: string, offset: number, limit: number) => {
      const runner = getRunner(taskId)

      if (runner) {
        const all = runner.getImages()
        return { images: all.slice(offset, offset + limit), total: all.length }
      }

      const record = await readRecord(taskId)

      if (!record) return { images: [], total: 0 }

      return {
        images: record.images.slice(offset, offset + limit),
        total: record.images.length,
      }
    },
  )
}
