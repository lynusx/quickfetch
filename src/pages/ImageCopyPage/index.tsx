import { useCallback, useEffect, useMemo } from 'react'
import {
  Box,
  Button,
  Text,
  RadioGroup,
  Flex,
  Card,
  Progress,
  CheckboxGroup,
  DataList,
  Badge,
  Callout,
  Spinner,
  Separator,
  Strong,
} from '@radix-ui/themes'
import {
  CopyIcon,
  InfoCircledIcon,
  CheckIcon,
  GearIcon,
  PlayIcon,
  DownloadIcon,
  FileIcon,
} from '@radix-ui/react-icons'

import useImageCopyStore from '../../store/imageCopyStore'

import {
  traverse,
  createValidators,
  writePathsToFile,
  copyFilesInBatches,
  getShiftInfo,
} from '../../utils/common'

import './index.css'
import { useToast } from '../../hooks/useToast'
import { Toast } from '../../components/Toast/Toast'

const ImageCopyPage = () => {
  const {
    selectedPlant,
    selectedTypes,
    currentScanRange,
    setSelectedPlant,
    setSelectedTypes,
    setCurrentScanRange,
    scannedFiles,
    isScanning,
    scanError,
    isCopying,
    copyError,
    copiedFileCount,
    setScannedFiles,
    setScanError,
    setCopiedFileCount,
    setScanningState,
    setCopyingState,
    setCopyError,
  } = useImageCopyStore()

  useEffect(() => {
    const shiftInfo = getShiftInfo(new Date())
    setCurrentScanRange({
      date: shiftInfo[0] as string,
      shift: shiftInfo[1] as string,
      times: shiftInfo[2] as string[],
    })
  }, [])

  const displayTypes = useMemo(() => {
    const typeMap = {
      脏污: ['NG_脏污_B', 'NG_脏污_C'],
      划伤: ['NG_划伤_B', 'NG_划伤_C'],
    }

    return selectedTypes.flatMap(
      (item) => typeMap[item as keyof typeof typeMap],
    )
  }, [selectedTypes])

  const { toast, showToast, hideToast } = useToast()

  // @ts-ignore
  const showDirectoryPicker: any =
    (window as any).showDirectoryPicker || undefined

  const handleSourceClick = useCallback(async () => {
    try {
      setScannedFiles([])
      setScanError(null)
      setCopiedFileCount(0)

      // @ts-ignore
      const rootDirHandle = await (window as any)
        .showDirectoryPicker({
          startIn: 'desktop',
        })
        .catch(() => {
          throw new Error('请选择有效目录')
        })

      if (rootDirHandle.name !== 'DC') {
        throw new Error('请选择名为 DC 的目录')
      }

      setScanningState(true)
      showToast('扫描开始', '正在扫描文件...', 'info')

      const dirs: string[] = []
      for await (const entry of rootDirHandle.values()) {
        const regStr = new RegExp(`^${selectedPlant}\\d+`)
        if (entry.kind === 'directory' && regStr.test(entry.name)) {
          dirs.push(entry.name)
        }
      }

      const validators = createValidators(
        dirs,
        currentScanRange.date,
        currentScanRange.shift,
        currentScanRange.times,
        displayTypes.filter((item): item is string => typeof item === 'string'),
      )

      const out: any[] = []
      await traverse(rootDirHandle, 0, validators, '', out)
      setScannedFiles(out)

      showToast('扫描完成', `共找到 ${out.length} 张图片`, 'success')
    } catch (error: any) {
      setScanError(error.message)
      showToast('扫描失败', error.message, 'error')
      console.error('Scanning error:', error)
    } finally {
      setScanningState(false)
    }
  }, [
    setScannedFiles,
    setScanError,
    setScanningState,
    showToast,
    currentScanRange.date,
    currentScanRange.shift,
    currentScanRange.times,
    displayTypes,
    selectedPlant,
  ])

  const handleTargetClick = useCallback(async () => {
    if (!scannedFiles.length) return

    try {
      setCopyError(null)
      setCopiedFileCount(0)

      // @ts-ignore
      const targetDirHandle = await (window as any)
        .showDirectoryPicker({
          startIn: 'desktop',
        })
        .catch(() => {
          throw new Error('请选择有效的目录')
        })

      if (
        (await targetDirHandle.queryPermission({ mode: 'readwrite' })) !==
        'granted'
      ) {
        if (
          (await targetDirHandle.requestPermission({ mode: 'readwrite' })) !==
          'granted'
        ) {
          throw new Error('写入目标目录权限被拒绝')
        }
      }

      showToast('复制开始', '正在复制文件...', 'info')

      setCopyingState(true)

      await writePathsToFile(
        targetDirHandle,
        scannedFiles.map((file) => file.path),
        'source.txt',
      )

      await copyFilesInBatches(
        scannedFiles,
        targetDirHandle,
        10,
        (progress: number) => {
          setCopiedFileCount(progress)
        },
      )

      showToast('复制完成', `已复制 ${scannedFiles.length} 张图片`, 'success')
    } catch (error: any) {
      setCopyError(error.message)
      showToast('复制失败', error.message, 'error')
    } finally {
      setCopyingState(false)
    }
  }, [
    scannedFiles,
    setCopyError,
    setCopiedFileCount,
    showToast,
    setCopyingState,
  ])

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
          {/* 扫描配置 */}
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
            <Flex align="center" gap="4">
              <Flex align="center">
                <Text
                  size="3"
                  weight="bold"
                  color="blue"
                  style={{ minWidth: '80px' }}
                >
                  厂区选择
                </Text>
                <RadioGroup.Root
                  defaultValue={selectedPlant}
                  onValueChange={setSelectedPlant}
                >
                  <Flex gap="4">
                    <RadioGroup.Item value="A">
                      <Text size="2">东区</Text>
                    </RadioGroup.Item>
                    <RadioGroup.Item value="B">
                      <Text size="2">西区</Text>
                    </RadioGroup.Item>
                  </Flex>
                </RadioGroup.Root>
              </Flex>

              <Separator orientation="vertical" mx="4" />

              <Flex align="center">
                <Text
                  size="3"
                  weight="bold"
                  color="blue"
                  style={{ minWidth: '80px' }}
                >
                  类型选择
                </Text>
                <CheckboxGroup.Root
                  defaultValue={selectedTypes}
                  name="types"
                  onValueChange={setSelectedTypes}
                >
                  <Flex gap="4">
                    <CheckboxGroup.Item value="脏污">
                      <Text size="2">脏污</Text>
                    </CheckboxGroup.Item>
                    <CheckboxGroup.Item value="划伤">
                      <Text size="2">划伤</Text>
                    </CheckboxGroup.Item>
                  </Flex>
                </CheckboxGroup.Root>
              </Flex>
            </Flex>
          </Box>

          <Separator my="4" size="4" />

          {/* 扫描范围 */}
          <Box mb="4">
            <Flex align="center" gap="2" mb="4">
              <InfoCircledIcon
                width="18"
                height="18"
                style={{ color: 'var(--blue-9)' }}
              />
              <Text size="4" weight="medium">
                扫描范围
              </Text>
            </Flex>
            <DataList.Root>
              <DataList.Item>
                <DataList.Label minWidth="60px">厂区</DataList.Label>
                <DataList.Value>
                  <Badge color="blue" variant="soft">
                    {selectedPlant === 'A' ? '东区' : '西区'}
                  </Badge>
                </DataList.Value>
              </DataList.Item>
              <DataList.Item>
                <DataList.Label minWidth="60px">日期</DataList.Label>
                <DataList.Value>
                  <Badge color="blue" variant="soft">
                    {currentScanRange.date}
                  </Badge>
                </DataList.Value>
              </DataList.Item>
              <DataList.Item>
                <DataList.Label minWidth="60px">班次</DataList.Label>
                <DataList.Value>
                  <Badge color="blue" variant="soft">
                    {currentScanRange.shift}
                  </Badge>
                </DataList.Value>
              </DataList.Item>
              <DataList.Item>
                <DataList.Label minWidth="60px">时段</DataList.Label>
                <DataList.Value>
                  <Flex gap="1" wrap="wrap">
                    {currentScanRange.times.map((time) => (
                      <Badge key={time} color="blue" variant="soft" size="1">
                        {time}点
                      </Badge>
                    ))}
                  </Flex>
                </DataList.Value>
              </DataList.Item>
              <DataList.Item>
                <DataList.Label minWidth="60px">类型</DataList.Label>
                <DataList.Value>
                  <Flex gap="1" wrap="wrap">
                    {displayTypes.map((type) => (
                      <Badge color="blue" variant="soft" size="1" key={type}>
                        {type}
                      </Badge>
                    ))}
                  </Flex>
                </DataList.Value>
              </DataList.Item>
            </DataList.Root>
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
                  {scannedFiles.length > 0 && (
                    <Badge color="green" variant="soft" size="1">
                      <CheckIcon width="12" height="12" />
                      {scannedFiles.length} 张
                    </Badge>
                  )}
                </Flex>

                <Button
                  size="3"
                  variant="solid"
                  color="blue"
                  onClick={handleSourceClick}
                  disabled={isScanning || isCopying}
                  style={{ width: '100%' }}
                >
                  {isScanning ? (
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

                {scanError && (
                  <Callout.Root color="red" mt="3" size="1">
                    <Callout.Text size="2">{scanError}</Callout.Text>
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
                          scannedFiles.length > 0
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
                  {copiedFileCount > 0 && (
                    <Badge color="green" variant="soft" size="1">
                      <CheckIcon width="12" height="12" />
                      {Math.round(
                        (copiedFileCount / scannedFiles.length) * 100,
                      )}
                      %
                    </Badge>
                  )}
                </Flex>

                <Button
                  size="3"
                  variant="solid"
                  color="green"
                  onClick={handleTargetClick}
                  disabled={!scannedFiles.length || isScanning || isCopying}
                  style={{ width: '100%' }}
                >
                  {isCopying ? (
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

                {copyError && (
                  <Callout.Root color="red" mt="3" size="1">
                    <Callout.Text size="2">{copyError}</Callout.Text>
                  </Callout.Root>
                )}
              </Box>
            </Flex>

            {/* 复制进度 */}
            {copiedFileCount > 0 && (
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
                    {Math.round((copiedFileCount / scannedFiles.length) * 100)}%
                  </Text>
                </Flex>
                <Progress
                  value={(copiedFileCount / scannedFiles.length) * 100}
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
                  已复制 {copiedFileCount} / {scannedFiles.length} 张图片
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
