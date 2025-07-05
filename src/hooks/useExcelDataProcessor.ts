import type { ExcelSheet } from './useExcelUpload'

interface ProcessRecord {
  WaferID: string
  线别: string
  不良项: string
  [key: string]: string | number
}

interface SheetJSONData {
  [process: string]: ProcessRecord[]
}

export const uesExcelDataProcessor = () => {
  /**
   * 将工作表数据转换为 JSON 数组
   * @param sheet 工作表数据
   * @returns 转换后的 JSON 数据
   */
  const sheet2json = (sheet: ExcelSheet): SheetJSONData => {
    const result: SheetJSONData = {}

    if (sheet.rowCount < 3) return result

    try {
      const headerRow1 = sheet.data[0]
      const headerRow2 = sheet.data[1]

      const publicFields = new Set(['WaferID', '线别', '不良项'])
      const excludeFields = new Set(['SE激光', '丝网印刷'])

      const processMap = new Map<
        string,
        { startCol: number; fields: string[] }
      >()

      let waferIdCol = -1
      let lineCol = -1
      let defectCol = -1
      let currentProcess: string | null = null

      // 识别制程结构
      for (let col = 0; col < sheet.colCount; col++) {
        const header = String(headerRow1[col] || '')
        const headerField = String(headerRow2[col] || '')

        if (publicFields.has(header)) {
          switch (header) {
            case 'WaferID':
              waferIdCol = col
              break
            case '线别':
              lineCol = col
              break
            case '不良项':
              defectCol = col
              break
            default:
              break
          }
          currentProcess = null
        } else if (header) {
          if (headerField) {
            // 新制程开始
            currentProcess = header

            if (!excludeFields.has(header) && !processMap.has(currentProcess)) {
              processMap.set(currentProcess, {
                startCol: col,
                fields: [headerField],
              })
              result[currentProcess] = []
            }
          }
        } else if (currentProcess && headerField) {
          processMap.get(currentProcess)?.fields.push(headerField)
        }
      }

      console.log(processMap)

      // 处理制程数据
      for (let rowIndex = 2; rowIndex < sheet.rowCount; rowIndex++) {
        const row = sheet.data[rowIndex] || []

        const publicRecord: Partial<ProcessRecord> = {
          WaferID: String(row[waferIdCol] ?? ''),
          线别: String(row[lineCol] ?? ''),
          不良项: String(row[defectCol] ?? ''),
        }

        for (const [process, { startCol, fields }] of processMap.entries()) {
          const processRecord: ProcessRecord = {
            ...publicRecord,
          } as ProcessRecord

          let hasData =
            Boolean(publicRecord['WaferID']) ||
            Boolean(publicRecord['线别']) ||
            Boolean(publicRecord['不良项'])

          for (let i = 0; i < fields.length; i++) {
            const colIndex = startCol + i
            const field = fields[i]

            processRecord[field] = row[colIndex] ?? ''

            if (row[colIndex] !== '' && row[colIndex] !== null) {
              hasData = true
            }
          }

          if (hasData) {
            result[process].push(processRecord)
          }
        }
      }

      return result
    } catch (error) {
      console.error(`sheet2json 处理工作表 ${sheet.name} 时出错: `, error)
      return result
    }
  }

  // 过滤 JSON 数组
  const filterWith = (jsonData: any[]) => {}

  // 分组统计 JSON 数组
  const counterWith = (jsonData: any[]) => {}

  // 生成工作表数据
  const generateSheetData = (jsonData: any[]) => {}

  return {
    sheet2json,
    filterWith,
    counterWith,
    generateSheetData,
  }
}
