/** 扫描失败的错误码，仅用于主进程内部归类与日志，跨 IPC 传递的是可读文案 */
export type ScanErrorCode =
  | 'PATH_NOT_FOUND'
  | 'NOT_DC_DIRECTORY'
  | 'PERMISSION_DENIED'
  | 'NO_PLANT_DIRECTORY'
  | 'STRUCTURE_MISMATCH'
  | 'NO_MATCHED_IMAGES'

export class ScanError extends Error {
  readonly code: ScanErrorCode

  constructor(code: ScanErrorCode, message: string) {
    super(message)
    this.name = 'ScanError'
    this.code = code
  }
}
