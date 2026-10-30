/**
 * 主进程抛出的错误会被 Electron 加上
 * "Error invoking remote method 'xxx': Error: 实际信息" 前缀，
 * 这里剥掉前缀，界面上只展示业务文案。
 */
export const toErrorMessage = (error: unknown, fallback: string): string => {
  const raw = error instanceof Error ? error.message : fallback
  const index = raw.lastIndexOf('Error: ')

  return index >= 0 ? raw.slice(index + 7) : raw
}
