import { useMemo } from 'react'
import type { ExcelFile, ExcelSheet } from './useExcelUpload'

export const useExcelViewer = (file: ExcelFile) => {
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
    if (file.status !== 'completed') {
      return []
    }

    const previewData: ExcelSheet[] = []

    try {
      file.sheets.forEach((sheet) => {
        try {
        } catch (sheetError) {
          console.error(`处理工作表 ${sheet.name} 时出错: `, sheetError)
        }
      })
    } catch (error) {
      console.error('生成预览数据失败:', error)
      return []
    }

    return previewData
  }, [file])

  return {
    getStatusColor,
    getStatusText,
    generatePreviewData,
  }
}
