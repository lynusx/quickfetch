import { useRef } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useExcelUpload } from '../hooks/useExcelUpload'
import { useExcelStore } from '../stores/excelStore'
import { cn } from '@/lib/utils'

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
    <div
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
      className={cn(
        'rounded-xl border border-dashed bg-card transition-colors outline-none',
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        isDrag && 'border-primary bg-primary/5',
        isProcess
          ? 'cursor-not-allowed opacity-80'
          : 'cursor-pointer hover:bg-muted/40',
      )}
    >
      <Empty className={cn('border-0', file ? 'py-6' : 'py-10')}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {isProcess ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FileSpreadsheet />
            )}
          </EmptyMedia>
          <EmptyTitle>{getStatusText()}</EmptyTitle>
          {!file && (
            <EmptyDescription>
              支持 .xlsx、.xls 格式，单次仅处理 1 个文件，最大 50MB
            </EmptyDescription>
          )}
        </EmptyHeader>
        {!isProcess && (
          <EmptyContent>
            <Button variant="outline">
              <Upload data-icon="inline-start" />
              {file ? '选择新文件' : '选择 Excel 文件'}
            </Button>
          </EmptyContent>
        )}
      </Empty>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={handleFileInputChange}
        disabled={isProcess}
      />
    </div>
  )
}

export default ExcelUploadZone
