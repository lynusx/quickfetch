import { useRef } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Table2, Upload } from 'lucide-react'
import { Box, Flex, Spinner, Text } from '@radix-ui/themes'

import { useExcelUpload } from '../hooks/useExcelUpload'
import { MAX_EXCEL_SIZE_LABEL } from '../constants'

const ExcelUploadZone = () => {
  const { isDrag, isProcess, setIsDrag, uploadFile } = useExcelUpload()

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
      : '拖拽或点击上传 Excel 文件'

  return (
    <Flex
      asChild
      direction="column"
      align="center"
      justify="center"
      gap="3"
      py="8"
      px="5"
    >
      <label
        className="upload-zone"
        data-drag={isDrag || undefined}
        data-busy={isProcess || undefined}
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
        <Flex
          className="upload-icon"
          align="center"
          justify="center"
          width="48px"
          height="48px"
        >
          {isProcess ? (
            <Spinner size="3" />
          ) : (
            <Table2 size={24} strokeWidth={1.75} />
          )}
        </Flex>

        <Text size="3" weight="medium" align="center">
          {statusText}
        </Text>
        <Box maxWidth="520px">
          <Text size="2" color="gray" align="center">
            支持 .xlsx、.xls 格式，单次仅处理 1 个文件，最大{' '}
            {MAX_EXCEL_SIZE_LABEL}
          </Text>
        </Box>

        {!isProcess ? (
          <Flex
            className="upload-cta"
            display="inline-flex"
            align="center"
            alignSelf="center"
            gap="2"
            mt="1"
            py="2"
            px="3"
          >
            <Upload size={14} strokeWidth={1.75} />
            <Text size="2" weight="medium" className="upload-cta-label">
              选择 Excel 文件
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
    </Flex>
  )
}

export default ExcelUploadZone
