/**
 * 任务活动通知：扫描与复制任务的状态变化只在这里广播一次，
 * 关心「当前有没有任务在跑」的模块（自动更新安装前检查）订阅它。
 *
 * 不复用 IPC 广播，是因为这里只关心布尔变化，不需要携带任务快照。
 */
type Listener = () => void

const listeners = new Set<Listener>()

export const onActivityChange = (listener: Listener): (() => void) => {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export const notifyActivityChange = (): void => {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // 活动通知不能影响任务本身
    }
  }
}
