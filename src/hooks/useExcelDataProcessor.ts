import type { ExcelSheet } from './useExcelUpload'

export const uesExcelDataProcessor = () => {
  // 将工作表数据转换为 JSON 数组
  const sheet2json = (sheet: ExcelSheet) => {}

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
