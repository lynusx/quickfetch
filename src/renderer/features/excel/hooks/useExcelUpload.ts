import { useCallback, useState } from 'react'
import * as XLSX from 'xlsx'

import type { ExcelFile, ExcelSheet } from '../types'
import { MAX_EXCEL_SIZE_BYTES, MAX_EXCEL_SIZE_LABEL } from '../constants'
import { useExcelStore } from '../stores/excelStore'
import { useSheetFilterStore } from '../stores/sheetFilterStore'
import { useToast } from '@/hooks/useToast'
import { formatFileSize } from '@/utils/common'

export const useExcelUpload = () => {
  const [isDrag, setIsDrag] = useState(false)
  const [isProcess, setIsProcess] = useState(false)
  const { setFile } = useExcelStore()
  const resetFilters = useSheetFilterStore((state) => state.reset)
  const { showToast } = useToast()

  const validateFile = (file: File): boolean => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ]

    if (
      !allowedTypes.includes(file.type) &&
      !file.name.match(/\.(xlsx|xls)$/i)
    ) {
      showToast(
        '上传失败',
        '不支持的文件格式，请上传 .xlsx 或 .xls 格式的 Excel 文件。',
        'error',
      )
      return false
    }

    if (file.size > MAX_EXCEL_SIZE_BYTES) {
      showToast(
        '上传失败',
        `文件大小超过限制，请上传小于 ${MAX_EXCEL_SIZE_LABEL} 的 Excel 文件。`,
        'error',
      )
      return false
    }
    return true
  }

  const processExcelFile = useCallback(
    async (file: File): Promise<ExcelFile> => {
      return new Promise((resolve) => {
        const reader = new FileReader()

        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer)
            const workbook = XLSX.read(data, { type: 'array' })

            const sheets: ExcelSheet[] = workbook.SheetNames.map(
              (sheetName) => {
                const worksheet = workbook.Sheets[sheetName]
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                  header: 1,
                  defval: '',
                  raw: false,
                }) as ExcelSheet['data']

                return {
                  name: sheetName,
                  data: jsonData,
                  rowCount: jsonData.length,
                  colCount:
                    jsonData.length > 0
                      ? Math.max(...jsonData.map((row) => row.length))
                      : 0,
                }
              },
            )

            const excelFile: ExcelFile = {
              id:
                Date.now().toString() + Math.random().toString(36).slice(2, 11),
              file,
              name: file.name,
              size: formatFileSize(file.size),
              uploadTime: new Date().toLocaleString('zh-CN'),
              status: 'completed',
              sheets,
            }

            resolve(excelFile)
          } catch (error) {
            const excelFile: ExcelFile = {
              id:
                Date.now().toString() + Math.random().toString(36).slice(2, 11),
              file,
              name: file.name,
              size: formatFileSize(file.size),
              uploadTime: new Date().toLocaleString('zh-CN'),
              status: 'error',
              sheets: [],
              error: error instanceof Error ? error : new Error('文件解析失败'),
            }

            resolve(excelFile)
          }
        }

        reader.onerror = () => {
          const excelFile: ExcelFile = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 11),
            file,
            name: file.name,
            size: formatFileSize(file.size),
            uploadTime: new Date().toLocaleString('zh-CN'),
            status: 'error',
            sheets: [],
            error: new Error('文件读取失败'),
          }

          resolve(excelFile)
        }

        reader.readAsArrayBuffer(file)
      })
    },
    [],
  )

  const uploadFile = async (file: File) => {
    if (!validateFile(file)) {
      return
    }

    setIsProcess(true)

    // 创建初始文件对象
    const initialFile: ExcelFile = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 11),
      file,
      name: file.name,
      size: formatFileSize(file.size),
      uploadTime: new Date().toLocaleString('zh-CN'),
      status: 'processing',
      sheets: [],
    }

    try {
      const processedFile = await processExcelFile(file)
      // 换文件后清空上一份文件的筛选，让新文件重新全选
      resetFilters()
      setFile(processedFile)
    } catch (error) {
      setFile({
        ...initialFile,
        status: 'error',
        error: error instanceof Error ? error : new Error('处理失败'),
      })
    } finally {
      setIsProcess(false)
    }
  }

  return {
    isDrag,
    isProcess,
    setIsDrag,
    setIsProcess,
    uploadFile,
  }
}
