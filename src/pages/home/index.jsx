import { useCallback } from 'react'
import useStore from '../../store'
import {
  Container,
  Box,
  Button,
  Text,
  RadioGroup,
  Flex,
  Card,
  Heading,
  Progress,
  CheckboxGroup,
  DataList,
  Badge,
  Callout,
  Spinner,
} from '@radix-ui/themes'
import {
  traverse,
  createValidators,
  writePathsToFile,
  copyFilesInBatches,
} from '../../utils/common'
import { Toast } from '../../components/Toast'
import './index.css'
import { useToast } from '../../hooks/useToast'

function Home() {
  const {
    files,
    plant,
    types,
    isScanning,
    scanError,
    copiedCount,
    isCopying,
    copyError,
    queryParams,
    setFiles,
    setPlant,
    setTypes,
    setScanningState,
    setScanError,
    setCopiedCount,
    setCopyingState,
    setCopyError,
  } = useStore()

  const { toast, showToast, hideToast } = useToast()

  const _types = types.flatMap((item) => {
    if (item === '脏污') {
      return ['NG_脏污_B', 'NG_脏污_C']
    } else if (item === '划伤') {
      return ['NG_划伤_B', 'NG_划伤_C']
    }
  })

  const handleSourceClick = useCallback(async () => {
    try {
      setFiles([])
      setScanError(null)
      setCopiedCount(0)

      const rootDirHandle = await showDirectoryPicker({
        startIn: 'desktop',
      }).catch(() => {
        throw new Error('请选择有效目录')
      })

      if (rootDirHandle.name !== 'DC') {
        throw new Error('请选择名为 DC 的目录')
      }

      setScanningState(true)
      showToast('扫描开始', '正在扫描文件...', 'info')

      const dirs = []
      for await (const entry of rootDirHandle.values()) {
        const regStr = new RegExp(`^${plant}\\d+`)

        if (entry.kind === 'directory' && regStr.test(entry.name)) {
          dirs.push(entry.name)
        }
      }

      const validators = createValidators(
        dirs,
        queryParams.date,
        queryParams.shift,
        queryParams.times,
        _types,
      )

      const out = []
      await traverse(rootDirHandle, 0, validators, '', out)
      setFiles(out)

      showToast('扫描完成', `共找到 ${out.length} 张图片`, 'success')
    } catch (error) {
      setScanError(error.message)
      showToast('扫描失败', error.message, 'error')
      console.error('Scanning error:', error)
    } finally {
      setScanningState(false)
    }
  }, [
    setFiles,
    setScanError,
    setScanningState,
    showToast,
    queryParams.date,
    queryParams.shift,
    queryParams.times,
    _types,
    plant,
  ])

  const handleTargetClick = useCallback(async () => {
    if (!files.length) return

    try {
      setCopyError(null)
      setCopiedCount(0)

      const targetDirHandle = await showDirectoryPicker({
        startIn: 'desktop',
      }).catch(() => {
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
        files.map((file) => file.path),
        'source.txt',
      )

      await copyFilesInBatches(files, targetDirHandle, 10, (progress) => {
        setCopiedCount(progress)
      })

      showToast('复制完成', `已复制 ${files.length} 张图片`, 'success')
    } catch (error) {
      setCopyError(error.message)
      showToast('复制失败', error.message, 'error')
    } finally {
      setCopyingState(false)
    }
  }, [files, setCopyError, setCopiedCount, showToast, setCopyingState])

  return (
    <Container size="2">
      <Card size="4" style={{ marginTop: '2rem', maxWidth: '800px', margin: '2rem auto' }}>
        <Heading size="6" align="center" mb="6" color="blue" trim="both">
          图片批量拷贝工具
        </Heading>

        <Box mb="6">
          <Card variant="surface">
            <Flex align="center" gap="4" p="4">
              <Text size="3" weight="bold" color="blue" style={{ minWidth: '80px' }}>
                厂区选择
              </Text>
              <RadioGroup.Root defaultValue={plant} onValueChange={setPlant}>
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
          </Card>
        </Box>

        <Box mb="6">
          <Card variant="surface">
            <Flex align="center" gap="4" p="4">
              <Text size="3" weight="bold" color="blue" style={{ minWidth: '80px' }}>
                类型选择
              </Text>
              <CheckboxGroup.Root
                defaultValue={types}
                name="types"
                onValueChange={setTypes}
              >
                <Flex gap="4">
                  <CheckboxGroup.Item value="脏污" disabled>
                    <Text size="2">脏污</Text>
                  </CheckboxGroup.Item>
                  <CheckboxGroup.Item value="划伤">
                    <Text size="2">划伤</Text>
                  </CheckboxGroup.Item>
                </Flex>
              </CheckboxGroup.Root>
            </Flex>
          </Card>
        </Box>

        <Card variant="surface" mb="6">
          <Callout.Root size="2" mb="4" color="blue">
            <Callout.Text>本次扫描的文件范围</Callout.Text>
          </Callout.Root>

          <DataList.Root>
            <DataList.Item align="center">
              <DataList.Label minWidth="88px">厂区</DataList.Label>
              <DataList.Value>
                <Badge color="blue" variant="soft" radius="full">
                  {plant === 'A' ? '东区' : '西区'}
                </Badge>
              </DataList.Value>
            </DataList.Item>
            <DataList.Item align="center">
              <DataList.Label minWidth="88px">日期</DataList.Label>
              <DataList.Value>
                <Badge color="blue" variant="soft" radius="full">
                  {queryParams.date}
                </Badge>
              </DataList.Value>
            </DataList.Item>
            <DataList.Item align="center">
              <DataList.Label minWidth="88px">班次</DataList.Label>
              <DataList.Value>
                <Badge color="blue" variant="soft" radius="full">
                  {queryParams.shift}
                </Badge>
              </DataList.Value>
            </DataList.Item>
            <DataList.Item align="center">
              <DataList.Label minWidth="88px">时段</DataList.Label>
              <DataList.Value>
                <Flex gap="2" wrap="wrap">
                  {queryParams.times.map((item) => (
                    <Badge
                      color="blue"
                      variant="soft"
                      radius="full"
                      key={item}
                    >
                      {item}点
                    </Badge>
                  ))}
                </Flex>
              </DataList.Value>
            </DataList.Item>
            <DataList.Item align="center">
              <DataList.Label minWidth="88px">类型</DataList.Label>
              <DataList.Value>
                <Flex gap="2" wrap="wrap">
                  {_types.map((item) => (
                    <Badge
                      color="blue"
                      variant="soft"
                      radius="full"
                      key={item}
                    >
                      {item}
                    </Badge>
                  ))}
                </Flex>
              </DataList.Value>
            </DataList.Item>
          </DataList.Root>
        </Card>

        <Flex direction="column" gap="6">
          <Box>
            <Button
              size="3"
              variant="solid"
              color="blue"
              onClick={handleSourceClick}
              disabled={isScanning || isCopying}
              style={{ width: '100%' }}
            >
              {isScanning ? (
                <Flex gap="4" align="center" justify="center">
                  <Spinner /> 扫描中...
                </Flex>
              ) : (
                '选择 DC 目录'
              )}
            </Button>
            {scanError && (
              <Text color="red" size="2" mt="2" weight="medium">
                {scanError}
              </Text>
            )}
            <Text align="center" color="gray" size="2" mt="2">
              已找到 {files.length} 张图片
            </Text>
          </Box>

          <Box>
            <Button
              size="3"
              variant="solid"
              color="green"
              onClick={handleTargetClick}
              disabled={!files.length || isScanning || isCopying}
              style={{ width: '100%' }}
            >
              {isCopying ? (
                <Flex gap="4" align="center" justify="center">
                  <Spinner /> 复制中...
                </Flex>
              ) : (
                '选择目标目录'
              )}
            </Button>
            {copyError && (
              <Text color="red" size="2" mt="2" weight="medium">
                {copyError}
              </Text>
            )}
            {copiedCount > 0 && (
              <Box mt="4">
                <Flex justify="between" mb="2">
                  <Text size="2" color="gray">
                    复制进度
                  </Text>
                  <Text size="2" color="gray">
                    {Math.round((copiedCount / files.length) * 100)}%
                  </Text>
                </Flex>
                <Progress
                  value={(copiedCount / files.length) * 100}
                  color="green"
                  size="3"
                  radius="full"
                />
                <Text align="center" color="gray" size="2" mt="2">
                  已复制 {copiedCount} / {files.length} 张图片
                </Text>
              </Box>
            )}
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
    </Container>
  )
}

export default Home