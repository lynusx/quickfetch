import type { ExcelFile, ExcelSheet } from './types'

/**
 * Excel 预览的纯逻辑：解析、筛选、计数、分组与表格化。
 *
 * 这里不 import React / zustand / Electron / 浏览器 API，回归脚本可以
 * 直接打包执行；hook 只保留 FileReader、XLSX、clipboard 与 store 写回。
 */

export interface ProcessRecord {
  WaferID: string
  线别: string
  不良项: string
  [key: string]: string | number
}

export interface SheetJSONData {
  [process: string]: ProcessRecord[]
}

export interface FilterWithParams {
  jsonSheet: SheetJSONData
  targetLines?: string[]
  targetDefects?: string[]
}

export interface Sheet2JsonResult {
  jsonSheet: SheetJSONData
  lines: Set<string>
  defects: Set<string>
}

const emptySheet = (): ExcelSheet => ({
  name: '',
  data: [],
  rowCount: 0,
  colCount: 0,
})

/** 将工作表数据转换为按制程分组的 JSON 数组 */
export const sheet2json = (sheet: ExcelSheet): Sheet2JsonResult => {
  const jsonSheet: SheetJSONData = {}
  const lines = new Set<string>()
  const defects = new Set<string>()

  if (sheet.rowCount < 3) return { jsonSheet, lines, defects }

  try {
    const headerRow1 = sheet.data[0]
    const headerRow2 = sheet.data[1]

    const publicFields = new Set(['WaferID', '线别', '不良项'])
    const excludeFields = new Set(['SE激光', '丝网印刷', '硼扩'])

    const processMap = new Map<string, { startCol: number; fields: string[] }>()

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
            jsonSheet[currentProcess] = []
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

      if (row[lineCol]) {
        lines.add((row[lineCol] as string).trim())
      }
      if (row[defectCol]) {
        defects.add((row[defectCol] as string).trim())
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
          jsonSheet[process].push(processRecord)
        }
      }
    }

    return { jsonSheet, lines, defects }
  } catch (error) {
    console.error(`sheet2json 处理工作表 ${sheet.name} 时出错: `, error)
    return { jsonSheet, lines, defects }
  }
}

/** 根据目标产线和不良项筛选；空数组表示该维度不过滤 */
export const filterWith = ({
  jsonSheet,
  targetLines = [],
  targetDefects = [],
}: FilterWithParams): SheetJSONData => {
  const filteredSheet: SheetJSONData = {}

  if (Object.keys(jsonSheet).length === 0) return filteredSheet

  const shouldFilterLines = targetLines.length > 0
  const shouldFilterDefects = targetDefects.length > 0

  Object.entries(jsonSheet).forEach(([process, records]) => {
    filteredSheet[process] = records.filter((record) => {
      const lineMatch =
        !shouldFilterLines || targetLines.includes(String(record['线别'] ?? ''))

      const defectMatch =
        !shouldFilterDefects ||
        targetDefects.includes(String(record['不良项'] ?? ''))

      return lineMatch && defectMatch
    })
  })

  return filteredSheet
}

/** 按指定键分组计数 */
export const counterByKey = <T>(
  arr: T[],
  keyExtractor: (item: T) => string,
): Record<string, number> =>
  arr.reduce(
    (acc, item) => {
      const key = keyExtractor(item)
      acc[key] = (acc[key] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

/** 按制程统计设备 ID 数量 */
export const counterWith = (
  jsonSheet: SheetJSONData,
): Record<string, number>[] => {
  if (Object.keys(jsonSheet).length === 0) return []

  return Object.values(jsonSheet).map((records) =>
    counterByKey(records, (record) => String(record['设备ID'] ?? '')),
  )
}

/** 9 工序时按业务规则分四组，组间插空行；其它数量原样返回 */
export const groupArray = (
  array: (string | number)[][][],
): (string | number)[][][] => {
  if (array.length === 0) return []

  const PROCESS_COUNT = 9
  const EMPTY_ROW: [string, string][] = [
    ['', ''],
    ['', ''],
  ]

  if (array.length === PROCESS_COUNT) {
    return [
      [...array[0], ...EMPTY_ROW, ...array[1]],
      [...array[2], ...EMPTY_ROW, ...array[3]],
      [...array[4], ...EMPTY_ROW, ...array[5], ...EMPTY_ROW, ...array[6]],
      [...array[7], ...EMPTY_ROW, ...array[8]],
    ]
  }

  return array
}

/** 把每组补齐到最大行数，空行用 ['', ''] */
export const alignArrayLengths = (
  arrays: (string | number)[][][],
): (string | number)[][][] => {
  if (arrays.length === 0) return []

  const maxLength = Math.max(...arrays.map((arr) => arr.length))
  const EMPTY_ROW: [string, string] = ['', '']

  return arrays.map((group) => {
    const paddingCount = maxLength - group.length
    const padding = Array.from({ length: paddingCount }, () => [...EMPTY_ROW])

    return [...group, ...padding]
  })
}

/** 把分组后的三维数组按行拼成二维表格，组间加空列 */
export const transformToTableFormat = (
  array: (string | number)[][][],
): (string | number)[][] => {
  if (array.length === 0) return []

  const alignedGroups = alignArrayLengths(array)
  const rowCount = alignedGroups[0]?.length || 0

  const tableData: (string | number)[][] = Array.from(
    { length: rowCount },
    () => [],
  )

  alignedGroups.forEach((group, groupIndex) => {
    group.forEach((row, rowIndex) => {
      if (groupIndex > 0) {
        tableData[rowIndex].push('', ...row)
      } else {
        tableData[rowIndex].push(...row)
      }
    })
  })

  return tableData
}

/** 每 3 列循环生成「设备ID / 数量 / 空」表头 */
export const generateHeaders = (columnCount: number): string[] => {
  const HEADER_PATTERN = ['设备ID', '数量', '']
  const PATTERN_LENGTH = HEADER_PATTERN.length

  return Array.from({ length: columnCount }, (_, index) => {
    const patternIndex = index % PATTERN_LENGTH
    return HEADER_PATTERN[patternIndex]
  })
}

/** 把计数结果转成可展示的 ExcelSheet */
export const generateSheetData = (
  array: Record<string, number>[],
  sheetName: string,
): ExcelSheet => {
  const sheetData = emptySheet()
  sheetData.name = sheetName

  if (array.length === 0 || Object.keys(array[0]).length === 0) {
    return sheetData
  }

  try {
    const convertedEntries = array.map((item) => {
      return Object.entries(item)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => [key || '空白', value])
    })

    const groupedData = groupArray(convertedEntries)
    const tableData = transformToTableFormat(groupedData)

    if (tableData.length > 0) {
      const headerRow = generateHeaders(tableData[0].length)
      tableData.unshift(headerRow)
    }

    sheetData.data = tableData
    sheetData.rowCount = tableData.length
    sheetData.colCount = tableData[0].length

    return sheetData
  } catch (error) {
    console.error(`generateSheetData 生成工作表 ${sheetName} 时出错: `, error)
    throw new Error('generateSheetData 生成工作表时出错')
  }
}

export interface PreviewInput {
  file: ExcelFile | null
  /** 当前 store 里已有的可选项，用于判断首次加载 */
  lines: ReadonlySet<string>
  defects: ReadonlySet<string>
  selectedLines: string[]
  selectedDefects: string[]
}

export interface PreviewResult {
  sheet: ExcelSheet
  allLines: Set<string>
  allDefects: Set<string>
  /** 首次加载时要写回的全选；undefined 表示不改动用户选择 */
  nextSelectedLines?: string[]
  nextSelectedDefects?: string[]
  /** 表格生成失败时带出原因；此时 sheet 为空，可选项仍然有效 */
  error?: unknown
}

/**
 * 预览流水线：解析 → 首次加载判定 → 筛选 → 计数 → 表格化。
 *
 * 「首次加载」与「空选择 = 不过滤」从原来的 effect 里搬进来，
 * 成为纯输入、纯输出的规则，可以在不渲染 React 的情况下测试。
 */
export const buildPreview = ({
  file,
  lines,
  defects,
  selectedLines,
  selectedDefects,
}: PreviewInput): PreviewResult => {
  const result: PreviewResult = {
    sheet: emptySheet(),
    allLines: new Set<string>(),
    allDefects: new Set<string>(),
  }

  if (!file || file.sheets.length === 0) return result

  const firstSheetData = file.sheets[0]
  const {
    jsonSheet,
    lines: allLines,
    defects: allDefects,
  } = sheet2json(firstSheetData)

  result.allLines = allLines
  result.allDefects = allDefects

  const isFirstLoad =
    lines.size === 0 &&
    defects.size === 0 &&
    selectedLines.length === 0 &&
    selectedDefects.length === 0

  if (isFirstLoad) {
    if (allLines.size > 0) result.nextSelectedLines = Array.from(allLines)
    if (allDefects.size > 0) result.nextSelectedDefects = Array.from(allDefects)
  }

  const effectiveLines =
    selectedLines.length > 0
      ? selectedLines
      : isFirstLoad
        ? Array.from(allLines)
        : []
  const effectiveDefects =
    selectedDefects.length > 0
      ? selectedDefects
      : isFirstLoad
        ? Array.from(allDefects)
        : []

  try {
    const filteredData = filterWith({
      jsonSheet,
      targetLines: effectiveLines,
      targetDefects: effectiveDefects,
    })
    const countedData = counterWith(filteredData)
    result.sheet = generateSheetData(countedData, firstSheetData.name)
  } catch (error) {
    result.error = error
  }

  return result
}
