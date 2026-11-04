import type { LogLevel, RendererLogEntry } from '@shared/ipc'

/**
 * 渲染层未捕获异常上报。
 *
 * 只发送拍平后的字段，不把 Error / DOM / 事件对象丢给主进程；
 * 日志本身失败时静默吞掉，绝不影响页面。
 */

let installed = false
let sending = false

const recent = new Map<string, { at: number; suppressed: number }>()

const send = (
  level: LogLevel,
  scope: string,
  event: string,
  meta: Record<string, unknown>,
): void => {
  if (sending) return

  const api = window.electronAPI
  if (!api?.logRenderer) return

  sending = true

  try {
    const entry: RendererLogEntry = { level, scope, event, meta }
    api.logRenderer(entry)
  } catch {
    // 日志上报失败不能影响渲染层业务
  } finally {
    sending = false
  }
}

/** 同一错误 1 秒内只发一次，重复次数附在下次发送的 suppressed 里 */
const sendDeduped = (
  level: LogLevel,
  scope: string,
  event: string,
  meta: Record<string, unknown>,
  key: string,
): void => {
  const now = Date.now()
  const previous = recent.get(key)

  if (previous && now - previous.at < 1000) {
    previous.suppressed += 1
    return
  }

  const suppressed = previous?.suppressed ?? 0
  recent.set(key, { at: now, suppressed: 0 })

  if (suppressed > 0) meta.suppressed = suppressed
  send(level, scope, event, meta)

  if (recent.size > 100) {
    for (const [entryKey, value] of recent) {
      if (now - value.at > 10_000) recent.delete(entryKey)
    }
  }
}

const onWindowError = (event: ErrorEvent): void => {
  const target = event.target

  // 图片/脚本等资源加载失败：target 是元素，不是 window
  if (target instanceof Element) {
    const source =
      (target as HTMLImageElement).src ||
      (target as HTMLScriptElement).src ||
      (target as HTMLLinkElement).href ||
      ''

    sendDeduped(
      'error',
      'renderer',
      'resource.error',
      { tagName: target.tagName, source },
      `resource|${target.tagName}|${source}`,
    )
    return
  }

  const error = event.error instanceof Error ? event.error : null
  const message = event.message || error?.message || '未知错误'
  const meta: Record<string, unknown> = {
    message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  }

  if (error) {
    meta.name = error.name
    meta.stack = error.stack
  }

  sendDeduped(
    'error',
    'renderer',
    'window.error',
    meta,
    `${message}|${event.filename}|${event.lineno}`,
  )
}

const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
  const reason = event.reason
  const error = reason instanceof Error ? reason : null
  const message = error?.message ?? String(reason)

  sendDeduped(
    'error',
    'renderer',
    'unhandledrejection',
    {
      reasonType: typeof reason,
      name: error?.name,
      message,
      stack: error?.stack,
    },
    `rejection|${message}`,
  )
}

/** 在 createRoot 之前调用；重复调用无副作用 */
export const installRendererErrorLogging = (): void => {
  if (installed || typeof window === 'undefined') return

  installed = true
  window.addEventListener('error', onWindowError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
}
