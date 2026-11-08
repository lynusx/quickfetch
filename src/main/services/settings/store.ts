import { randomUUID } from 'node:crypto'
import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { logger } from '../log'

/**
 * 设置文件的持久化内核。
 *
 * 这一层只管「怎么安全地读、改、写一个 JSON 配置」：ENOENT 才回落默认、
 * 损坏/版本不符留档、临时文件 + rename 的原子写、读改写串行队列、
 * 启动时清理残留 tmp。目录、默认值与具体形状由调用方注入。
 *
 * 以前这些机制与四个类别的 normalizer、discovery、偏好与历史保留混在
 * 同一个 800 行 module 里，`readSettings` 硬编码 `app.getPath`，内核
 * 无法用临时目录测试。现在内核只认 `file` 与 `normalize`。
 */

export interface SettingsStoreOptions<T> {
  /** 配置文件的绝对路径；生产用 userData，测试用临时目录 */
  file: string
  /** 文件不存在或损坏时的默认值 */
  fallback: () => T
  /** 版本/形状校验；不通过按「不支持」留档后回落默认 */
  isSupported: (value: unknown) => boolean
  /** 解析后的原始对象 → 规范化值；运行期字段在这里补 */
  normalize: (value: Record<string, unknown>) => T
  /** 落盘前去掉运行期字段；缺省原样序列化 */
  serialize?: (value: T) => unknown
}

export interface SettingsStore<T> {
  file: string
  read: () => Promise<T>
  /** 在串行队列里完成一次读改写；返回同一对象表示无需落盘 */
  update: (mutate: (current: T) => T | Promise<T>) => Promise<T>
  /** 等待当前排队的写入全部落盘；失败也放行 */
  flush: () => Promise<void>
  /** 清理上次进程被强杀时留下的临时文件 */
  cleanupTemp: () => Promise<void>
}

const errorCode = (error: unknown): string | undefined =>
  (error as NodeJS.ErrnoException | undefined)?.code

export const createSettingsStore = <T>({
  file,
  fallback,
  isSupported,
  normalize,
  serialize,
}: SettingsStoreOptions<T>): SettingsStore<T> => {
  /**
   * 把损坏/版本不认识的配置留档，避免下一次写入把现场配置直接覆盖掉。
   * 留档失败不阻塞启动，只记录日志。
   */
  const quarantine = async (reason: string): Promise<void> => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')

    try {
      await rename(file, `${file}.corrupt-${stamp}`)
      logger.warn('settings', 'settings.quarantined', {
        path: file,
        reason,
      })
    } catch (error) {
      logger.error('settings', 'settings.quarantine.failed', {
        path: file,
        reason,
        error,
      })
    }
  }

  const read = async (): Promise<T> => {
    let raw: string

    try {
      raw = await readFile(file, 'utf-8')
    } catch (error) {
      // 只有“文件不存在”能安全回落默认值。权限/占用等临时错误如果也当成
      // 没配置，接下来的任意写入都会把现场配置覆盖成默认值。
      if (errorCode(error) === 'ENOENT') return fallback()

      logger.error('settings', 'settings.read.failed', { path: file, error })

      throw new Error(
        `读取配置文件失败：${(error as Error)?.message ?? '未知错误'}`,
      )
    }

    let parsed: unknown

    try {
      parsed = JSON.parse(raw)
    } catch {
      await quarantine('invalid-json')
      return fallback()
    }

    if (!isSupported(parsed)) {
      await quarantine('unsupported-version')
      return fallback()
    }

    return normalize(parsed as Record<string, unknown>)
  }

  /** 原子写：先写临时文件再 rename，避免断电留下半截 JSON */
  const write = async (value: T): Promise<void> => {
    const body = JSON.stringify(serialize ? serialize(value) : value, null, 2)
    // 并发写时固定的 .tmp 会互相截断；唯一后缀保证每次写入各用各的临时文件
    const temp = `${file}.${process.pid}.${randomUUID()}.tmp`

    await writeFile(temp, body, 'utf-8')
    await rename(temp, file)

    logger.debug('settings', 'settings.write', {
      path: file,
      bytes: body.length,
    })
  }

  /**
   * 读改写串行队列。
   *
   * 所有 mutator 都是「读全量 → 改 → 写全量」，并发时后写会覆盖先写
   * （扫描时多台机台同时回写探测结果就会丢缓存）。只在 write 外面排队
   * 不够，必须把读、改、写整体串起来。
   */
  let queue: Promise<unknown> = Promise.resolve()

  const withLock = <R>(task: () => Promise<R>): Promise<R> => {
    const run = queue.then(task, task)

    queue = run.then(
      () => undefined,
      () => undefined,
    )

    return run
  }

  const update = (mutate: (current: T) => T | Promise<T>): Promise<T> =>
    withLock(async () => {
      const current = await read()
      const next = await mutate(current)

      if (next !== current) await write(next)

      return next
    })

  /**
   * 清理上次进程被强杀时留下的 `<file>.*.tmp`。
   *
   * 正常写入会 rename 掉临时文件；只有写盘途中进程消失才会残留。
   * 只在启动时清一次，避免和正在进行的写入抢同一个临时文件。
   */
  const cleanupTemp = async (): Promise<void> => {
    const dir = dirname(file)
    const prefix = `${basename(file)}.`

    try {
      const names = await readdir(dir)

      await Promise.all(
        names
          .filter((name) => name.startsWith(prefix) && name.endsWith('.tmp'))
          .map((name) => rm(join(dir, name), { force: true })),
      )
    } catch (error) {
      // 清理失败不影响启动，下次启动再试
      logger.error('settings', 'cleanup-temp.failed', { error })
    }
  }

  return {
    file,
    read,
    update,
    flush: () =>
      queue.then(
        () => undefined,
        () => undefined,
      ),
    cleanupTemp,
  }
}
