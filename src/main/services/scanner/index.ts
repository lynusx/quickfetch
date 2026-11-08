// 扫描任务对外入口：路由到任务注册表，具体执行逻辑在 task.ts。
export {
  createTask,
  getArchive,
  getRunner,
  getTask,
  persistUnfinished,
  startTask,
} from './registry'
export type { TaskContext } from './task'
export type { TaskArchive } from './archive'

// 历史记录的结构与还原
export { toTask } from './history'
