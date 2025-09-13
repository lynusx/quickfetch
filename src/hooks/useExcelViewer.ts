import { useState } from 'react'

import { uesExcelDataProcessor } from './useExcelDataProcessor'
import { useExcelOperations } from './useExcelOpertions'
import { useExcelStore } from '../stores/excelStore'
import { useSheetFilterStore } from '../stores/sheetFilterStore'

import type { ExcelSheet } from '../types'

export const useExcelViewer = () => {
  const [isCopy, setIsCopy] = useState(false)
  const [isExport, setIsExport] = useState(false)

  const { sheet2json, filterWith, counterWith, generateSheetData } =
    uesExcelDataProcessor()
  const { copyToClipboard, exportToExcel } = useExcelOperations()
  const { setSheet, file } = useExcelStore()
  const {
    lines,
    defects,
    selectedLines,
    selectedDefects,
    setLines,
    setDefects,
    setSelectedLines,
    setSelectedDefects,
  } = useSheetFilterStore()

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

  // 处理复制操作
  const handleCopyToClipboard = async (sheet: ExcelSheet) => {
    try {
      setIsCopy(true)
      await copyToClipboard(sheet)
    } catch (error) {
      alert(error instanceof Error ? error.message : '复制失败，请重试')
    } finally {
      setIsCopy(false)
    }
  }

  // 处理导出操作
  const handleExportToExcel = async (sheet: ExcelSheet) => {
    try {
      setIsExport(true)
      await exportToExcel(sheet)
    } catch (error) {
      alert(error instanceof Error ? error.message : '导出失败，请重试')
    } finally {
      setIsExport(false)
    }
  }

  // 生成预览数据
  const generateSheetDate = () => {
    setSheet({
      name: '',
      data: [],
      rowCount: 0,
      colCount: 0,
    })

    try {
      if (!file || file.sheets.length === 0) return

      // 默认只处理第一个工作表
      const firstSheetData = file.sheets[0]

      // 1. 将工作表数据转换为 JSON 数组
      const {
        jsonSheet,
        lines: allLines,
        defects: allDefects,
      } = sheet2json(firstSheetData)
      // 更新可选项到 store
      setLines(allLines)
      setDefects(allDefects)

      // 判断是否为首次加载（store 中没有可选项且用户未手动选择）
      const isFirstLoad =
        lines.size === 0 &&
        defects.size === 0 &&
        selectedLines.length === 0 &&
        selectedDefects.length === 0

      // 首次加载时默认全选所有可选项；若用户已手动清空，则保留空状态
      if (isFirstLoad) {
        if (allLines.size > 0) setSelectedLines(Array.from(allLines))
        if (allDefects.size > 0) setSelectedDefects(Array.from(allDefects))
      }

      // 2. 根据目标产线和不良项筛选数据
      // 当用户清空选择时，传空数组表示不应用该过滤条件（filterWith 会根据长度判断是否生效）
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

      const filteredData = filterWith({
        jsonSheet: jsonSheet,
        targetLines: effectiveLines,
        targetDefects: effectiveDefects,
      })

      // 3. 对筛选后的数据进行分组统计
      const countedData = counterWith(filteredData)

      // 4. 将分组统计结果转换为表格格式数据
      const sheetData = generateSheetData(countedData, firstSheetData.name)

      setSheet(sheetData)
    } catch (error) {
      console.error('生成预览数据失败:', error)
    }
  }

  return {
    getStatusColor,
    getStatusText,
    generateSheetDate,
    handleCopyToClipboard,
    handleExportToExcel,
    isCopy,
    isExport,
  }
}
