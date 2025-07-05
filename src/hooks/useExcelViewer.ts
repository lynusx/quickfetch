export const useExcelViewer = () => {
  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green'
      case 'processing':
        return 'orange'
      case 'error':
        return 'red'
      default:
        return 'gray'
    }
  }

  // 获取状态文本
  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return '解析完成'
      case 'processing':
        return '处理中'
      case 'error':
        return '解析失败'
      default:
        return '未知状态'
    }
  }

  return {
    getStatusColor,
    getStatusText,
  }
}
