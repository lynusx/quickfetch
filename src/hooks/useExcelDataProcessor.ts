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

  /**
   * 根据业务规则对工序数据进行分组
   *
   * @description
   * 该函数按照特定的业务逻辑将工序数据分组。当输入包含10个工序时，将其分为4个预定义组：
   * 1. 制绒、碱抛、RCA (索引 0, 3, 6)
   * 2. 硼扩、氧化 (索引 1, 2)
   * 3. Poly、退火 (索引 4, 5)
   * 4. ALD、正膜、背膜 (索引 7, 8, 9)
   *
   * 每组之间使用空行分隔。若输入不是10个工序，则直接返回所有数据连续排列。
   *
   * @param array - 三维数组结构的数据，格式为 [工序][设备键值对][键/值]
   * @returns 按业务规则分组后的三维数组，组间添加了空行分隔
   *
   * @example
   * // 10个工序的分组
   * groupArray([制绒, 硼扩, 氧化, 碱抛, Poly, 退火, RCA, ALD, 正膜, 背膜]);
   * // 返回: [[制绒, 空行, 空行, 碱抛, 空行, 空行, RCA], [硼扩, 空行, 空行, 氧化], ...]
   */
  const groupArray = (
    array: (string | number)[][][],
  ): (string | number)[][][] => {
    // 空输入快速返回
    if (array.length === 0) return []

    // 工序数量常量
    const PROCESS_COUNT = 10

    // 空行模板
    const EMPTY_ROW: [string, string] = ['', '']

    // 特殊处理10个工序的情况
    if (array.length === PROCESS_COUNT) {
      return [
        // 第一组: 制绒(0)、碱抛(3)、RCA(6)
        [
          ...array[0],
          EMPTY_ROW,
          EMPTY_ROW,
          ...array[3],
          EMPTY_ROW,
          EMPTY_ROW,
          ...array[6],
        ],
        // 第二组: 硼扩(1)、氧化(2)
        [...array[1], EMPTY_ROW, EMPTY_ROW, ...array[2]],
        // 第三组: Poly(4)、退火(5)
        [...array[4], EMPTY_ROW, EMPTY_ROW, ...array[5]],
        // 第四组: ALD(7)、正膜(8)、背膜(9)
        [
          ...array[7],
          EMPTY_ROW,
          EMPTY_ROW,
          ...array[8],
          EMPTY_ROW,
          EMPTY_ROW,
          ...array[9],
        ],
      ]
    }

    // 默认情况：直接返回所有工序数据连续排列
    return array
  }

  /**
   * 对齐数组长度，确保所有子数组具有相同行数
   *
   * @description
   * 该函数将输入的三维数组中每个二维组扩展到相同的行数（最大行数），
   * 不足的行用空单元格填充（['', '']）
   *
   * @param arrays - 三维数组，格式为 [组][行][列]
   * @returns 行数对齐后的三维数组
   *
   * @example
   * const input = [
   *   [['A1'], ['A2']], // 2行
   *   [['B1']]          // 1行
   * ];
   * alignArrayLengths(input);
   * // 返回: [
   * //   [['A1'], ['A2']],
   * //   [['B1'], ['', '']] // 填充到2行
   * // ]
   */
  const alignArrayLengths = (
    arrays: (string | number)[][][],
  ): (string | number)[][][] => {
    if (arrays.length === 0) return []

    // 1. 计算最大行数
    const maxLength = Math.max(...arrays.map((arr) => arr.length))

    // 2. 创建空行模板
    const EMPTY_ROW: [string, string] = ['', '']

    // 3. 对齐所有组到最大行数
    return arrays.map((group) => {
      // 当前组需要填充的行数
      const paddingCount = maxLength - group.length

      // 创建填充行数组
      const padding = Array.from({ length: paddingCount }, () => [...EMPTY_ROW])

      // 返回填充后的组
      return [...group, ...padding]
    })
  }

  /**
   * 将分组后的三维数组转换为适合表格显示的二维数组
   *
   * @description
   * 该函数将分组后的三维数据转换为二维表格格式，主要步骤包括：
   * 1. 对齐所有组的数据行数（通过 alignArrayLengths）
   * 2. 按行组织数据，组间添加分隔列
   * 3. 构建最终的二维表格结构
   *
   * 组间分隔规则：
   * - 第一组数据直接添加
   * - 后续每组数据前添加一个空列作为分隔
   *
   * @param array - 分组后的三维数组，格式为 [组][行][列]
   * @returns 转换后的二维表格数据
   *
   * @example
   * const grouped = [
   *   [['A1', 10], ['A2', 20]],
   *   [['B1', 30]]
   * ];
   * transformToTableFormat(grouped);
   * // 返回: [
   * //   ['A1', 10, '', 'B1', 30],
   * //   ['A2', 20, '', '', '']
   * // ]
   */
  const transformToTableFormat = (
    array: (string | number)[][][],
  ): (string | number)[][] => {
    // 空输入快速返回
    if (array.length === 0) return []

    // 1. 对齐所有组的数据行数
    const alignedGroups = alignArrayLengths(array)
    const rowCount = alignedGroups[0]?.length || 0

    // 2. 初始化结果数组（二维表格）
    const tableData: (string | number)[][] = Array.from(
      { length: rowCount },
      () => [],
    )

    // 3. 遍历每组数据，按行组织
    alignedGroups.forEach((group, groupIndex) => {
      group.forEach((row, rowIndex) => {
        // 组间分隔：第一组不加分隔，其他组前加空列
        if (groupIndex > 0) {
          tableData[rowIndex].push('', ...row)
        } else {
          tableData[rowIndex].push(...row)
        }
      })
    })

    return tableData
  }

  /**
   * 生成表格表头行
   *
   * @description
   * 根据列数生成表头数组，按照每3列一组重复以下模式：
   * 1. 第1列: "设备ID"
   * 2. 第2列: "数量"
   * 3. 第3列: 空字符串（作为分隔列）
   *
   * @param columnCount - 表格的列总数
   * @returns 生成的表头数组，长度等于 columnCount
   *
   * @example
   * generateHeaders(5);
   * // 返回: ["设备ID", "数量", "", "设备ID", "数量"]
   */
  const generateHeaders = (columnCount: number): string[] => {
    // 表头模式常量
    const HEADER_PATTERN = ['设备ID', '数量', '']
    const PATTERN_LENGTH = HEADER_PATTERN.length

    // 使用 Array.from 高效创建结果数组
    return Array.from({ length: columnCount }, (_, index) => {
      // 计算当前列在模式中的位置
      const patternIndex = index % PATTERN_LENGTH
      return HEADER_PATTERN[patternIndex]
    })
  }

  /**
   * 将分组数据转换为表格格式数据
   *
   * @description
   * 该函数将分组统计结果转换为适合Excel展示的数据。主要处理步骤包括：
   * 1. 将对象转为键值对数组
   * 2. 按键升序排序
   * 3. 将空键替换为'空白'
   * 4. 按业务逻辑分组数据
   * 5. 将分组数据转换为表格格式数据
   * 6. 生成表头
   * 7. 返回格式化后的ExcelSheet对象
   *
   * @template CounterResult 分组统计结果类型, 应为键值对（Record<string, number>）
   *
   * @param array 分组统计结果数组
   * @param sheetName 生成的Excel工作表名称
   *
   * @returns 格式化后的 ExcelSheet 对象，包含工作表名称、数据、行数和列数
   */
  const generateSheetData = (
    array: CounterResult[],
    sheetName: string,
  ): ExcelSheet => {
    // 如果数组为空，则返回空的工作表
    if (array.length === 0) {
      return {
        name: sheetName,
        data: [],
        rowCount: 0,
        colCount: 0,
      }
    }

    try {
      // 转换和预处理每个分组数据
      // 1. 将对象转为键值对数组
      const convertedEntries = array.map((item) => {
        return Object.entries(item)
          .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) //按键升序排序
          .map(([key, value]) => [key || '空白', value]) // 空键替换为'空白'
      })

      // 2. 按业务逻辑分组数据
      const groupedData = groupArray(convertedEntries)

      // 3. 将分组数据转换为表格格式数据
      const tableData = transformToTableFormat(groupedData)

      // 4. 生成表头（仅在数据存在时生成）
      if (tableData.length > 0) {
        const headerRow = generateHeaders(tableData[0].length)
        tableData.unshift(headerRow)
      }

      return {
        name: sheetName,
        data: tableData,
        rowCount: tableData.length,
        colCount: tableData[0].length,
      }
    } catch (error) {
      console.error(`generateSheetData 生成工作表 ${sheetName} 时出错: `, error)
      return {
        name: sheetName,
        data: [],
        rowCount: 0,
        colCount: 0,
      }
    }
  }

  return {
    sheet2json,
    filterWith,
    counterWith,
    generateSheetData,
  }
}
