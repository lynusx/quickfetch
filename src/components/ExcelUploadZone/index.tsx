import React, { useRef } from 'react'
import { Box, Text, Button, Flex } from '@radix-ui/themes'
import { FileTextIcon, UploadIcon } from '@radix-ui/react-icons'

import { useExcelUpload } from '../../hooks/useExcelUpload'
import { useExcelStore } from '../../stores/excelStore'

import './index.css'

const ExcelUploadZone = () => {
  const { isDrag, isProcess, setIsDrag, uploadFile } = useExcelUpload()
  const { file: originFile } = useExcelStore()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDrag(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDrag(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDrag(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      uploadFile(files[0]) // 每次只处理1个文件
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      uploadFile(files[0])
    }
    e.target.value = ''
  }

  const handleClick = () => {
    if (!isProcess) {
      fileInputRef.current?.click()
    }
  }

  const hasFile = originFile !== null

  const getStatusText = () => {
    if (isProcess) return '正在解析 Excel 文件...'
    if (isDrag) return '释放文件以上传'
    if (hasFile) return '点击或拖拽新文件以替换'
    return '拖拽或点击上传 Excel 文件'
  }

  return (
    <Box
      className={`excel-upload-zone ${isDrag ? 'dragging' : ''} ${isProcess ? 'processing' : ''} ${hasFile ? 'has-file' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      style={{ cursor: isProcess ? 'not-allowed' : 'pointer' }}
    >
      <Flex direction="column" align="center" justify="center" gap="4" py="8">
        <Box className="upload-icon">
          {isProcess ? (
            <div className="processing-spinner">
              <FileTextIcon width="32" height="32" />
            </div>
          ) : (
            <FileTextIcon width="32" height="32" />
          )}
        </Box>
        <Box style={{ textAlign: 'center' }}>
          <Text
            size="4"
            weight="medium"
            mb="2"
            style={{ color: 'var(--gray-12)' }}
          >
            {getStatusText()}
          </Text>
          <Text size="2" style={{ color: 'var(--gray-10)' }}>
            支持 .xlsx、.xls 格式，最大 50MB
          </Text>
        </Box>
        {!isProcess && (
          <Button size="3" variant="soft" disabled={isProcess}>
            <UploadIcon width="16" height="16" />
            {hasFile ? '选择新文件' : '选择 Excel 文件'}
          </Button>
        )}
      </Flex>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
        disabled={isProcess}
      />
    </Box>
  )
}

export default ExcelUploadZone
