import { useRef } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { TableIcon, UploadIcon } from '@radix-ui/react-icons'
import { Box, Button, Flex, Heading, Spinner, Text } from '@radix-ui/themes'

import { useExcelUpload } from '../hooks/useExcelUpload'
import { useExcelStore } from '../stores/excelStore'

const ExcelUploadZone = () => {
  const { isDrag, isProcess, setIsDrag, uploadFile } = useExcelUpload()
  const { file } = useExcelStore()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDrag(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDrag(false)
    }
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDrag(false)

    const files = event.dataTransfer.files
    if (files.length > 0) {
      uploadFile(files[0])
    }
  }

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      uploadFile(files[0])
    }
    event.target.value = ''
  }

  const handleClick = () => {
    if (!isProcess) fileInputRef.current?.click()
  }

  const getStatusText = () => {
    if (isProcess) return '正在解析 Excel 文件…'
    if (isDrag) return '释放文件以上传'
    if (file) return '点击或拖拽新文件以替换'
    return '拖拽或点击上传 Excel 文件'
  }

  return (
    <Box
      role="button"
      tabIndex={isProcess ? -1 : 0}
      aria-disabled={isProcess}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleClick()
        }
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        borderRadius: 'var(--radius-4)',
        border: `1px dashed ${isDrag ? 'var(--accent-9)' : 'var(--gray-7)'}`,
        backgroundColor: isDrag
          ? 'var(--accent-a2)'
          : isProcess
            ? 'var(--gray-a2)'
            : 'var(--color-panel-solid)',
        cursor: isProcess ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        outline: 'none',
      }}
    >
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="3"
        py={file ? '6' : '8'}
        px="4"
        style={{ textAlign: 'center' }}
      >
        <Box
          style={{
            padding: 12,
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--gray-3)',
            color: 'var(--accent-9)',
          }}
        >
          {isProcess ? (
            <Spinner size="3" />
          ) : (
            <TableIcon width={28} height={28} />
          )}
        </Box>

        <Flex direction="column" gap="1" align="center">
          <Heading size="3">{getStatusText()}</Heading>
          {!file && (
            <Text size="1" color="gray">
              支持 .xlsx、.xls 格式，单次仅处理 1 个文件，最大 50MB
            </Text>
          )}
        </Flex>

        {!isProcess && (
          <Button variant="surface" color="gray" size="2">
            <UploadIcon width={14} height={14} />
            {file ? '选择新文件' : '选择 Excel 文件'}
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
