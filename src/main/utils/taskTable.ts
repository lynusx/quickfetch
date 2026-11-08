/**
 * 内存任务表：扫描与复制共用的容量上限与淘汰规则。
 *
 * 运行中的任务永远保留，只淘汰最早的已结束任务。以前两个 registry
 * 各写一遍同样的 Map + evict 循环，容量语义一改就要改两处。
 */
export interface TableTask {
  readonly id: string
  readonly createdAt: number
}

export interface TaskTable<T extends TableTask> {
  add: (task: T) => void
  get: (id: string) => T | null
  values: () => T[]
  size: () => number
  evict: () => void
}

export const createTaskTable = <T extends TableTask>(options: {
  max: number
  isFinal: (task: T) => boolean
  onEvict?: (task: T) => void
}): TaskTable<T> => {
  const tasks = new Map<string, T>()

  const evict = (): void => {
    if (tasks.size <= options.max) return

    const finished = [...tasks.values()]
      .filter(options.isFinal)
      .sort((a, b) => a.createdAt - b.createdAt)

    for (const task of finished) {
      if (tasks.size <= options.max) break

      tasks.delete(task.id)
      options.onEvict?.(task)
    }
  }

  return {
    add: (task) => {
      tasks.set(task.id, task)
      evict()
    },
    get: (id) => tasks.get(id) ?? null,
    values: () => [...tasks.values()],
    size: () => tasks.size,
    evict,
  }
}
