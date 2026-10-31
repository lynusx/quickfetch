import { shell } from 'electron'

/**
 * 力禧特入口里那些 .lnk 的目标地址。
 *
 * 现场给的 46 个样本是「只有 EnvironmentVariableDataBlock」的特殊快捷方式：
 * 没有 LinkTargetIDList，也没有 LinkInfo，目标地址只写在那个扩展块里。
 * 自己解的话要按 MS-SHLLINK 逐个块走，出一点偏差就静默读空；Windows 上
 * 直接问系统最稳，所以这里只用 Electron 的 readShortcutLink。
 *
 * 代价是它在非 Windows 平台不可用 —— 沙箱里没法验证，只能由真实环境兜底。
 * 所以每个失败路径都返回可读原因，而不是抛异常让整轮识别崩掉。
 */

export type LnkResult =
  | { ok: true; target: string; host: string }
  | { ok: false; reason: string }

/** 去掉首尾空白和尾部残留的 null 字节 */
const clean = (value: string): string => value.replace(/\0+$/, '').trim()

/**
 * 从目标路径里取出 UNC 主机。
 *
 * 只认 `\\主机` 或 `\\主机\共享` 这种形态（必须两个反斜杠）；
 * `E:\...` 这类本地路径、以及单反斜杠的残缺写法都返回 null ——
 * 样本里那个「东区 - 快捷方式.lnk」就指向本地桌面，
 * 它不该变成一台永远连不上的机台。
 */
export const uncHostOf = (target: string): string | null => {
  const normalized = clean(target).replace(/\//g, '\\')

  const matched = /^\\\\+([^\\]+)/.exec(normalized)

  if (!matched) return null

  const host = matched[1].trim()

  return host ? `\\\\${host}` : null
}

export const readLnk = (file: string): LnkResult => {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      reason: '仅 Windows 支持解析快捷方式，当前系统无法识别',
    }
  }

  let target = ''

  try {
    target = clean(shell.readShortcutLink(file)?.target ?? '')
  } catch (error) {
    const message = (error as Error | undefined)?.message ?? ''

    return {
      ok: false,
      reason: message
        ? `无法读取快捷方式：${message}`
        : '无法读取快捷方式，目标可能指向不存在的路径',
    }
  }

  if (!target) return { ok: false, reason: '快捷方式没有记录目标地址' }

  const host = uncHostOf(target)

  if (!host) {
    return {
      ok: false,
      reason: `目标不是网络路径（${target}），已跳过`,
    }
  }

  return { ok: true, target, host }
}
