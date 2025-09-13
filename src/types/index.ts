export interface Image {
  path: string
  fileHandle: FileSystemFileHandle
}

export interface ExcelFile {
  id: string
  file: File
  name: string
  size: string
  uploadTime: string
  status: 'processing' | 'completed' | 'error'
  sheets: ExcelSheet[]
  error?: Error
}

export interface ExcelSheet {
  name: string
  data: (string | number | null)[][]
  rowCount: number
  colCount: number
}
