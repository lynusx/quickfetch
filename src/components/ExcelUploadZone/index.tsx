import React, { useRef, type FC } from 'react'
import { Box, Text, Button, Flex } from '@radix-ui/themes'
import { FileTextIcon, UploadIcon } from '@radix-ui/react-icons'

import './index.css'

interface ExcelUploadZoneProps {
  onFileSelected: (file: File) => void
  isDragging: boolean
  onDragStateChange: (isDragging: boolean) => void
  isProcessing: boolean
  hasFile: boolean
}

const ExcelUploadZone: FC<ExcelUploadZoneProps> = ({
  onFileSelected,
  isDragging,
  onDragStateChange,
  isProcessing,
  hasFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDragStateChange(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      onDragStateChange(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDragStateChange(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      onFileSelected(files[0]) // 只处理第一个文件
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      onFileSelected(files[0])
    }
    e.target.value = ''
  }

  const handleClick = () => {
    if (!isProcessing) {
      fileInputRef.current?.click()
    }
  }

  const getStatusText = () => {
    if (isProcessing) return '正在解析 Excel 文件...'
    if (isDragging) return '释放文件以上传'
    if (hasFile) return '点击或拖拽新文件以替换'
    return '拖拽或点击上传 Excel 文件'
  }

  return (
    <Box
      className={`excel-upload-zone ${isDragging ? 'dragging' : ''} ${isProcessing ? 'processing' : ''} ${hasFile ? 'has-file' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      style={{ cursor: isProcessing ? 'not-allowed' : 'pointer' }}
    >
      <Flex direction="column" align="center" justify="center" gap="4" py="8">
        <Box className="upload-icon">
          {isProcessing ? (
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
        {!isProcessing && (
          <Button size="3" variant="soft" disabled={isProcessing}>
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
        disabled={isProcessing}
      />
    </Box>
  )
}

export default ExcelUploadZone
