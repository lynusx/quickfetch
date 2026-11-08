import { hasRunningCopyTasks } from '../copy/registry'
import { hasRunningScanTasks } from '../scanner/registry'
import { describeTaskBlock, type TaskBlock } from './state'

export const getTaskBlock = (): TaskBlock =>
  describeTaskBlock(hasRunningScanTasks(), hasRunningCopyTasks())
