import { useRef } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { TableIcon, UploadIcon } from '@radix-ui/react-icons'
import { Flex, Spinner, Text } from '@radix-ui/themes'

import { useExcelUpload } from '../hooks/useExcelUpload'
import { useExcelStore } from '../stores/excelStore'

const ExcelUploadZone = () => {
  const { isDrag, isProcess, setIsDrag, uploadFile } = useExcelUpload()
  const { file } = useExcelStore()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDrag(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDrag(false)
    }
  }

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
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

  const openPicker = () => {
    if (!isProcess) fileInputRef.current?.click()
  }

  const statusText = isProcess
    ? '正在解析 Excel 文件…'
    : isDrag
      ? '释放文件以上传'
      : file
        ? '点击或拖拽新文件以替换'
        : '拖拽或点击上传 Excel 文件'

  return (
    <label
      className="upload-zone"
      data-drag={isDrag || undefined}
      data-busy={isProcess || undefined}
      data-compact={file ? true : undefined}
      role="button"
      tabIndex={isProcess ? -1 : 0}
      aria-disabled={isProcess}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openPicker()
        }
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Flex className="upload-icon" align="center" justify="center">
        {isProcess ? (
          <Spinner size="3" />
        ) : (
          <TableIcon width={24} height={24} />
        )}
      </Flex>

      <Text as="span" className="upload-title">
        {statusText}
      </Text>
      <Text as="span" size="1" color="gray" className="upload-desc">
        {file
          ? `当前文件：${file.name}`
          : '支持 .xlsx、.xls 格式，单次仅处理 1 个文件，最大 50MB'}
      </Text>

      {!isProcess ? (
        <Flex className="upload-cta" align="center" gap="1">
          <UploadIcon width={13} height={13} />
          <Text as="span" size="1" weight="medium">
            {file ? '选择新文件' : '选择 Excel 文件'}
          </Text>
        </Flex>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        hidden
        onChange={handleFileInputChange}
        disabled={isProcess}
      />
    </label>
  )
}

export default ExcelUploadZone
