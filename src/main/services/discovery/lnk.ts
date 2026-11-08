import { readFileSync } from 'node:fs'

import { shell } from 'electron'

/**
 * 力禧特入口里那些 .lnk 的目标地址。
 *
 * 现场给的 46 个样本是「只有 EnvironmentVariableDataBlock」的特殊快捷方式：
 * 没有 LinkTargetIDList，也没有 LinkInfo（LinkFlags 的 bit0、bit1 都是 0），
 * 目标地址只写在 EnvironmentVariableDataBlock 的 TargetAnsi / TargetUnicode 里。
 *
 * Electron 的 shell.readShortcutLink 只认 IDList / LinkInfo，读这批样本会
 * 返回空 target —— 所以这里自研解析为主，先按 MS-SHLLINK 逐个块走，读不出
 * 时再回退到 shell.readShortcutLink（对标准的「右键 → 创建快捷方式」仍然有效）。
 */

export type LnkResult =
  { ok: true; target: string; host: string } | { ok: false; reason: string }

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

// EnvironmentVariableDataBlock 的签名，小端读取后是 0xA0000001
const ENV_BLOCK_SIGNATURE = 0xa0000001

/**
 * 遍历 extra data block，取出 EnvironmentVariableDataBlock 里的目标地址。
 *
 * ShellLinkHeader 固定 76 字节，后面紧跟一串块，每块结构是
 * BlockSize(4) + BlockSignature(4) + payload。EnvironmentVariableDataBlock
 * 的 payload 是 TargetAnsi(260) + TargetUnicode(520)。
 *
 * 优先读 Unicode 字段（覆盖中文路径），为空再回退 ANSI。
 */
const targetFromEnvBlock = (buffer: Buffer): string => {
  let offset = 76

  while (offset + 8 <= buffer.length) {
    const blockSize = buffer.readUInt32LE(offset)

    // 块大小小于 4 或越界说明结构已经乱了，别再往前走
    if (blockSize < 4 || offset + blockSize > buffer.length) break

    const signature = buffer.readUInt32LE(offset + 4)

    if (signature === ENV_BLOCK_SIGNATURE) {
      const body = offset + 8

      // 先读 Unicode（520 字节，UTF-16LE），再回退 ANSI（260 字节）
      const unicode = buffer
        .subarray(body + 260, body + 260 + 520)
        .toString('utf16le')
      const unicodeText = clean(unicode)

      if (unicodeText) return unicodeText

      const ansi = buffer.subarray(body, body + 260).toString('latin1')
      return clean(ansi)
    }

    offset += blockSize
  }

  return ''
}

/**
 * 自研解析 .lnk：只覆盖「目标地址在 EnvironmentVariableDataBlock」这一种
 * 情况，其余都返回空字符串，交给调用方回退到 shell.readShortcutLink。
 */
const parseLnkTarget = (file: string): string => {
  let buffer: Buffer

  try {
    buffer = readFileSync(file)
  } catch {
    return ''
  }

  // ShellLinkHeader 至少 76 字节，更短的不是合法快捷方式
  if (buffer.length < 76) return ''

  return targetFromEnvBlock(buffer)
}

export const readLnk = (file: string): LnkResult => {
  // 先走自研解析：这批样本的目标只在 EnvironmentVariableDataBlock，
  // shell.readShortcutLink 读不到
  let target = clean(parseLnkTarget(file))

  // 自研读不出，再回退到系统 API（Windows 上对标准快捷方式有效）
  if (!target && process.platform === 'win32') {
    try {
      target = clean(shell.readShortcutLink(file)?.target ?? '')
    } catch {
      target = ''
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
