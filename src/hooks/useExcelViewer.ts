import { useMemo, useState } from 'react'

import type { ExcelFile, ExcelSheet } from './useExcelUpload'
import { uesExcelDataProcessor } from './useExcelDataProcessor'
import { useExcelOperations } from './useExcelOpertions'

interface FilterOptions {
  selectedLines: string[]
  selectedDefects: string[]
}

export const useExcelViewer = (
  file: ExcelFile,
  filterOptions: FilterOptions,
) => {
  const [isCopied, setIsCopied] = useState(false)
  const [isExported, setIsExported] = useState(false)

  const { sheet2json, filterWith, counterWith, generateSheetData } =
    uesExcelDataProcessor()
  const { copyToClipboard, exportToExcel } = useExcelOperations()

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green'
      case 'processing':
        return 'orange'
      case 'error':
        return 'red'
      default:
        return 'gray'
    }
  }

  // 获取状态文本
  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return '解析完成'
      case 'processing':
        return '处理中'
      case 'error':
        return '解析失败'
      default:
        return '未知状态'
    }
  }

  // 生成预览数据
  const generatePreviewData = useMemo(() => {
    const previewData: ExcelSheet = {
      name: '',
      data: [],
      rowCount: 0,
      colCount: 0,
    }

    if (file.status !== 'completed') {
      return {
        lines: new Set<string>(),
        defects: new Set<string>(),
        previewData,
      }
    }

    try {
      // 默认只处理第一个工作表
      const firstSheetData = file.sheets[0]

      // 1. 将工作表数据转换为 JSON 数组
      const { jsonSheet, lines, defects } = sheet2json(firstSheetData)

      // 2. 根据目标产线和不良项筛选数据
      const filteredData = filterWith({
        jsonSheet: jsonSheet,
        targetLines: filterOptions.selectedLines,
        targetDefects: filterOptions.selectedDefects,
      })

      // 3. 对筛选后的数据进行分组统计
      const countedData = counterWith(filteredData)

      // 4. 将分组统计结果转换为表格格式数据
      const sheetData = generateSheetData(countedData, firstSheetData.name)

      previewData.name = firstSheetData.name
      previewData.data = sheetData.data
      previewData.rowCount = sheetData.rowCount
      previewData.colCount = sheetData.colCount

      return {
        lines,
        defects,
        previewData,
      }
    } catch (error) {
      console.error('生成预览数据失败:', error)
      return {
        lines: new Set<string>(),
        defects: new Set<string>(),
        previewData,
      }
    }
  }, [file, filterOptions])

  // 处理复制操作
  const handleCopyToClipboard = async (sheet: ExcelSheet) => {
    try {
      setIsCopied(true)
      await copyToClipboard(sheet)
    } catch (error) {
      alert(error instanceof Error ? error.message : '复制失败，请重试')
    } finally {
      setIsCopied(false)
    }
  }

  // 处理导出操作
  const handleExportToExcel = async (sheet: ExcelSheet) => {
    try {
      setIsExported(true)
      await exportToExcel(sheet)
    } catch (error) {
      alert(error instanceof Error ? error.message : '导出失败，请重试')
    } finally {
      setIsExported(false)
    }
  }

  return {
    getStatusColor,
    getStatusText,
    generatePreviewData,
    handleCopyToClipboard,
    handleExportToExcel,
    isCopied,
    isExported,
  }
}
