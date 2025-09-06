import {
  Box,
  Button,
  Text,
  Flex,
  Card,
  Progress,
  Badge,
  Callout,
  Spinner,
  Separator,
  Strong,
} from '@radix-ui/themes'
import {
  CopyIcon,
  CheckIcon,
  GearIcon,
  PlayIcon,
  DownloadIcon,
  FileIcon,
} from '@radix-ui/react-icons'

import { useImageCopy } from '../../hooks/useImageCopy'
import { Toast } from '../../components/Toast'
import { useToast } from '../../hooks/useToast'
import ImageFilterPanel from '../../components/ImageFilterPanel'
import { useImageStore } from '../../stores/imageStore'

import './index.css'

const ImageCopyPage = () => {
  const { toast, hideToast, showToast } = useToast()
  const { images, copiedImageCount, isCopy, isScan, isError, error } =
    useImageStore()
  const {
    canStartScan,
    canStartCopy,
    getCopyProgress,
    handleImageScan,
    handleImageCopy,
  } = useImageCopy({
    showToast,
  })

  return (
    <Box>
      {/* 页面标题 */}
      <Box mb="6">
        <Flex align="center" gap="3" mb="2">
          <CopyIcon
            width="24"
            height="24"
            style={{ color: 'var(--accent-9)' }}
          />
          <Text size="6" weight="bold" style={{ color: 'var(--gray-12)' }}>
            图片批量拷贝工具
          </Text>
          <Badge color="green" variant="soft">
            活跃
          </Badge>
        </Flex>
        <Text size="3" style={{ color: 'var(--gray-11)' }}>
          快速扫描 DC 目录，爬取指定图片到目标目录，支持按厂区、脏污类型筛选
        </Text>
      </Box>

      {/* 功能卡片 */}
      <Card size="3" mb="4">
        <Flex direction="column">
          {/* 扫描范围 */}
          <Box mb="4">
            <Flex align="center" gap="2" mb="4">
              <GearIcon
                width="18"
                height="18"
                style={{ color: 'var(--blue-9)' }}
              />
              <Text size="4" weight="medium">
                扫描配置
              </Text>
            </Flex>

            {/* 厂区、日期、时间、班次、类型 */}
            <ImageFilterPanel />
          </Box>

          <Separator my="4" size="4" />

          {/* 操作步骤 */}
          <Box>
            <Flex align="center" gap="2" mb="4">
              <PlayIcon
                width="18"
                height="18"
                style={{ color: 'var(--green-9)' }}
              />
              <Text size="4" weight="medium">
                操作步骤
              </Text>
            </Flex>
            <Flex justify="between" gap="4">
              {/* 步骤1：扫描 */}
              <Box flexGrow="1">
                <Flex align="center" justify="between" mb="3">
                  <Flex align="center" gap="2">
                    <Box
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'var(--blue-9)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold',
                      }}
                    >
                      1
                    </Box>
                    <Text size="4" weight="medium">
                      扫描源目录
                    </Text>
                  </Flex>
                  {images.length > 0 && (
                    <Badge color="green" variant="soft" size="1">
                      <CheckIcon width="12" height="12" />
                      {images.length} 张
                    </Badge>
                  )}
                </Flex>

                <Button
                  size="3"
                  variant="solid"
                  color="blue"
                  onClick={handleImageScan}
                  disabled={!canStartScan()}
                  style={{ width: '100%' }}
                >
                  {isScan ? (
                    <Flex gap="2" align="center" justify="center">
                      <Spinner size="2" />
                      扫描中...
                    </Flex>
                  ) : (
                    <Flex gap="2" align="center" justify="center">
                      <FileIcon width="16" height="16" />
                      选择 DC 目录
                    </Flex>
                  )}
                </Button>

                {isScan && isError && (
                  <Callout.Root color="red" mt="3" size="1">
                    <Callout.Text size="2">{error?.message}</Callout.Text>
                  </Callout.Root>
                )}
              </Box>

              {/* 步骤2：复制 */}
              <Box flexGrow="1">
                <Flex align="center" justify="between" mb="3">
                  <Flex align="center" gap="2">
                    <Box
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background:
                          images.length > 0
                            ? 'var(--green-9)'
                            : 'var(--gray-8)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold',
                      }}
                    >
                      2
                    </Box>
                    <Text size="4" weight="medium">
                      复制到目标目录
                    </Text>
                  </Flex>
                  {copiedImageCount > 0 && (
                    <Badge color="green" variant="soft" size="1">
                      <CheckIcon width="12" height="12" />
                      {getCopyProgress()}%
                    </Badge>
                  )}
                </Flex>

                <Button
                  size="3"
                  variant="solid"
                  color="green"
                  onClick={handleImageCopy}
                  disabled={!canStartCopy()}
                  style={{ width: '100%' }}
                >
                  {isCopy ? (
                    <Flex gap="2" align="center" justify="center">
                      <Spinner size="2" />
                      复制中...
                    </Flex>
                  ) : (
                    <Flex gap="2" align="center" justify="center">
                      <DownloadIcon width="16" height="16" />
                      选择目标目录
                    </Flex>
                  )}
                </Button>

                {isCopy && isError && (
                  <Callout.Root color="red" mt="3" size="1">
                    <Callout.Text size="2">{error?.message}</Callout.Text>
                  </Callout.Root>
                )}
              </Box>
            </Flex>

            {/* 复制进度 */}
            {copiedImageCount > 0 && (
              <Box
                mt="4"
                p="4"
                style={{
                  background: 'var(--green-2)',
                  borderRadius: '8px',
                  border: '1px solid var(--green-6)',
                }}
              >
                <Flex justify="between" mb="3">
                  <Text
                    size="3"
                    weight="medium"
                    style={{ color: 'var(--green-11)' }}
                  >
                    复制进度
                  </Text>
                  <Text
                    size="3"
                    weight="medium"
                    style={{ color: 'var(--green-11)' }}
                  >
                    {getCopyProgress()}%
                  </Text>
                </Flex>
                <Progress
                  value={getCopyProgress()}
                  color="green"
                  size="3"
                  radius="full"
                />
                <Text
                  size="2"
                  style={{
                    color: 'var(--green-10)',
                    textAlign: 'center',
                    display: 'block',
                  }}
                  mt="2"
                >
                  已复制 {copiedImageCount} / {images.length} 张图片
                </Text>
              </Box>
            )}
          </Box>
        </Flex>
      </Card>

      {/* 使用说明 */}
      <Card size="3">
        <Text size="4" weight="medium" mb="4">
          使用说明
        </Text>
        <Flex direction="column" gap="3">
          <Box>
            <Text
              size="3"
              weight="medium"
              mb="1"
              mr="1"
              style={{ color: 'var(--gray-12)' }}
            >
              1. 参数配置
            </Text>
            <Text size="2" style={{ color: 'var(--gray-11)' }}>
              选择<Strong>厂区</Strong>和<Strong>图片类型</Strong>
              ，系统会自动根据当前时间确定扫描范围
            </Text>
          </Box>
          <Box>
            <Text
              size="3"
              weight="medium"
              mb="1"
              mr="1"
              style={{ color: 'var(--gray-12)' }}
            >
              2. 扫描文件
            </Text>
            <Text size="2" style={{ color: 'var(--gray-11)' }}>
              选择包含图片的
              <Badge color="blue" variant="soft">
                DC
              </Badge>
              目录，系统会自动扫描符合条件的所有子目录
            </Text>
          </Box>
          <Box>
            <Text
              size="3"
              weight="medium"
              mb="1"
              mr="1"
              style={{ color: 'var(--gray-12)' }}
            >
              3. 批量拷贝
            </Text>
            <Text size="2" style={{ color: 'var(--gray-11)' }}>
              选择<Strong>目标路径</Strong>
              ，系统会自动将扫描到的图片文件拷贝到该路径下，并生成一个
              <Badge color="blue" variant="soft">
                source.txt
              </Badge>
              文件，用于记录拷贝的文件路径
            </Text>
          </Box>
        </Flex>
      </Card>

      <Toast
        open={toast.open}
        setOpen={hideToast}
        title={toast.title}
        description={toast.description}
        type={toast.type}
      />
    </Box>
  )
}

export default ImageCopyPage
