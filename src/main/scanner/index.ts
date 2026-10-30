// 扫描任务对外入口：路由到任务注册表，具体执行逻辑在 task.ts。
export { createTask, getRunner, getTask, listTasks } from './registry'
export type { TaskContext } from './task'
