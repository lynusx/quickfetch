import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { buildPreview } from '../pipeline'
import { useExcelOperations } from './useExcelOperations'
import { useExcelStore } from '../stores/excelStore'
import { useSheetFilterStore } from '../stores/sheetFilterStore'

import type { ExcelSheet } from '../types'

export const useExcelViewer = () => {
  const [isCopy, setIsCopy] = useState(false)
  const [isExport, setIsExport] = useState(false)

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

  // 处理复制操作
  const handleCopyToClipboard = async (sheet: ExcelSheet) => {
    try {
      setIsCopy(true)
      await copyToClipboard(sheet)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '复制失败，请重试')
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
      toast.error(error instanceof Error ? error.message : '导出失败，请重试')
    } finally {
      setIsExport(false)
    }
  }

  // 生成预览数据。解析、首次加载与筛选规则都在 pipeline 里，这里只负责写回 store
  const generateSheetDate = useCallback(() => {
    const result = buildPreview({
      file,
      lines,
      defects,
      selectedLines,
      selectedDefects,
    })

    setLines(result.allLines)
    setDefects(result.allDefects)

    if (result.nextSelectedLines) setSelectedLines(result.nextSelectedLines)
    if (result.nextSelectedDefects)
      setSelectedDefects(result.nextSelectedDefects)

    setSheet(result.sheet)

    if (result.error) {
      console.error('生成预览数据失败:', result.error)
    }
  }, [
    file,
    lines,
    defects,
    selectedLines,
    selectedDefects,
    setLines,
    setDefects,
    setSelectedLines,
    setSelectedDefects,
    setSheet,
  ])

  return {
    generateSheetDate,
    handleCopyToClipboard,
    handleExportToExcel,
    isCopy,
    isExport,
  }
}
