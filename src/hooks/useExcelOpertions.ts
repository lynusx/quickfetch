import { useCallback } from 'react'
import * as XLSX from 'xlsx'

import type { ExcelSheet } from './useExcelUpload'

export const useExcelOperations = () => {
  const copyToClipboard = useCallback(async (sheet: ExcelSheet) => {
    try {
      // 将数据转换为制表符分割的文本格式
      const rows = sheet.data.map((row) => row.join('\t'))
      const textContent = [...rows].join('\n')

      // 使用现代剪切板 API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textContent)
      }

      return true
    } catch (error) {
      console.error('复制到剪切板时出错:', error)
      throw new Error('复制失败，请重试')
    }
  }, [])

  // 导出为 Excel 文件
  const exportToExcel = useCallback(async (sheet: ExcelSheet) => {
    try {
      if (sheet.data.length === 0) {
        throw new Error(`${sheet.name}没有可导出的数据`)
      }

      // 创建工作簿
      const workbook = XLSX.utils.book_new()

      // 创建工作表
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.data)

      // 设置列宽
      const columnWidths = sheet.data[0].map((_, index) => {
        const maxLength = Math.max(
          ...sheet.data.map((row) => String(row[index]).length),
        )

        // 6 < 内容宽度 < 50
        return { wch: Math.min(Math.max(maxLength + 5, 6), 50) }
      })
      worksheet['!cols'] = columnWidths

      // 设置表头样式
      const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
      for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
        if (!worksheet[cellAddress]) continue

        worksheet[cellAddress].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '4F46E5' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
          },
        }
      }

      // 添加工作表到工作簿
      XLSX.utils.book_append_sheet(workbook, worksheet, '分析结果')

      // 生成文件名
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
      const fullFilename = `${sheet.name}分析报告_${timestamp}.xlsx`

      // 导出文件
      XLSX.writeFile(workbook, fullFilename)

      return true
    } catch (error) {
      console.error('导出 Excel 文件时出错:', error)
      throw new Error('导出失败，请重试')
    }
  }, [])

  return {
    copyToClipboard,
    exportToExcel,
  }
}
