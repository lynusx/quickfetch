import { useState } from 'react'

export const useExcelUpload = () => {
  const [currentFile, setCurrentFile] = useState<null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const uploadFile = () => {}

  return {
    currentFile,
    isDragging,
    isProcessing,
    setIsDragging,
    uploadFile,
  }
}
