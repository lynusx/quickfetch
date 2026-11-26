/**
 * 自动更新的错误判定与文案。
 *
 * 纯函数，不依赖 electron-updater，回归测试可以直接覆盖；
 * 文案只在这里维护，service 与设置页看到的错误保持一致。
 */

export const isCancellationError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'CancellationError' || /cancell?ed/i.test(error.message))

/**
 * 值得重试的瞬时错误：发版后 GitHub 的 CDN 可能短暂返回 5xx，
 * 网络抖动也会给出 ECONNRESET/ETIMEDOUT 等。404（缺 latest.yml）
 * 与校验失败重试没有意义。
 */
export const isTransientCheckError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)

  return /\b(?:500|502|503|504)\b|ERR_HTTP_RESPONSE_CODE_FAILURE|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|net::ERR/i.test(
    message,
  )
}

export const describeUpdateError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)

  if (/\b(?:500|502|503|504)\b|ERR_HTTP_RESPONSE_CODE_FAILURE/i.test(message)) {
    return 'GitHub 暂时不可用，请稍后重试或打开下载页面手动更新'
  }

  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|net::/i.test(message)) {
    return '无法连接 GitHub Releases，请检查网络后重试'
  }

  if (/404|CHANNEL_FILE_NOT_FOUND/i.test(message)) {
    return 'Release 上缺少更新信息（latest.yml），请确认发版资产完整'
  }

  if (/sha512|checksum|integrity/i.test(message)) {
    return '更新包校验失败，请重新下载'
  }

  if (/app-update\.yml/i.test(message)) {
    return '当前免安装版不支持自动检查更新，请点击「打开下载页面」获取最新版'
  }

  if (/ENOENT|no such file or directory/i.test(message)) {
    return '更新所需文件缺失，请尝试打开下载页面手动更新'
  }

  if (/EACCES|EPERM/i.test(message)) {
    return '没有权限写入更新缓存，请检查目录权限'
  }

  const cleaned = message
    .split('\n')[0]
    .replace(/,\s*(?:open|stat|scandir|access)\s+['"]?[^'"]+['"]?/gi, '')
    .replace(/[A-Za-z]:\\[^\s'"]+/g, '')
    .trim()

  return cleaned
    ? `更新失败：${cleaned}`
    : '更新失败，请稍后重试或打开下载页面手动更新'
}
