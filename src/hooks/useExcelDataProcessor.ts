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

interface FilterWithParams {
  jsonSheet: SheetJSONData
  targetLines?: string[]
  targetDefects?: string[]
}

interface CounterResult {
  [key: string]: number
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

  /**
   * 根据目标产线和不良项筛选数据
   * @param jsonSheet 需要筛选的对象
   * @param targetLines 目标产线（默认为空数组）
   * @param targetDefects 目标不良项（默认为空数组）
   * @returns 筛选后的数据
   */
  const filterWith = ({
    jsonSheet,
    targetLines = [],
    targetDefects = [],
  }: FilterWithParams): SheetJSONData => {
    const filteredSheet: SheetJSONData = {}

    // 预计算筛选条件状态避免重复判断
    const shouldFilterLines = targetLines.length > 0
    const shouldFilterDefects = targetDefects.length > 0

    Object.entries(jsonSheet).forEach(([process, records]) => {
      // 单次便利同时应用两个筛选条件
      filteredSheet[process] = records.filter((record) => {
        // 检查产线条件
        const lineMatch =
          !shouldFilterLines ||
          targetLines.includes(String(record['线别'] ?? ''))

        // 检查不良项条件
        const defectMatch =
          !shouldFilterDefects ||
          targetDefects.includes(String(record['不良项'] ?? ''))

        return lineMatch && defectMatch
      })
    })

    return filteredSheet
  }

  /**
   * 根据指定键对对象数组进行分组统计
   * @typeParam T 数组元素的类型
   * @param arr 需要进行分组统计的数组
   * @param keyExtractor 键提取函数，用于从元素中提取分组键
   * @returns 分组统计结果对象，键为分组键值，值为该组元素的数量
   */
  const counterByKey = <T>(
    arr: T[],
    keyExtractor: (item: T) => string,
  ): CounterResult => {
    return arr.reduce((acc, item) => {
      const key = keyExtractor(item)
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as CounterResult)
  }

  // 分组统计 JSON 数组
  const counterWith = (jsonSheet: SheetJSONData): CounterResult[] => {
    const result = Object.values(jsonSheet).map((records) =>
      counterByKey(records, (record) => String(record['设备ID'] ?? '')),
    )
    return result
  }

  // 生成工作表数据
  const generateSheetData = (jsonData: any[]) => {}

  return {
    sheet2json,
    filterWith,
    counterWith,
    generateSheetData,
  }
}
