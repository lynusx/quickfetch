import { Box, Button, CheckboxGroup, Flex, Text } from '@radix-ui/themes'
import {
  CheckIcon,
  CommitIcon,
  Cross2Icon,
  CrumpledPaperIcon,
} from '@radix-ui/react-icons'

import { useSheetFilterStore } from '../../stores/sheetFilterStore'
import { useExcelStore } from '../../stores/excelStore'

const SheetFilterPanel = () => {
  const {
    lines,
    defects,
    selectedLines,
    selectedDefects,
    setSelectedLines,
    setSelectedDefects,
  } = useSheetFilterStore()
  const { setSheet } = useExcelStore()

  const emptySheet = { name: '', data: [], rowCount: 0, colCount: 0 }

  return (
    <Flex direction="column" gap="4">
      {/* 线别选择 */}
      {lines.size > 0 && (
        <Box>
          <Flex align="center" justify="between" mb="2">
            <Flex align="center" gap="2">
              <CommitIcon
                width="16"
                height="16"
                style={{ color: 'var(--gray-11)' }}
              />
              <Text
                size="3"
                weight="medium"
                style={{ color: 'var(--gray-11)' }}
              >
                线别
              </Text>
              <Text size="2" style={{ color: 'var(--gray-10)' }}>
                ({selectedLines.length}/{lines.size})
              </Text>
            </Flex>
            <Flex gap="2">
              {selectedLines.length > 0 && (
                <Button
                  variant="soft"
                  size="1"
                  color="red"
                  onClick={() => {
                    setSelectedLines([])
                    setSheet(emptySheet)
                  }}
                >
                  <Cross2Icon width="12" height="12" />
                  清空
                </Button>
              )}
              <Button
                variant="soft"
                size="1"
                onClick={() => setSelectedLines([...lines])}
                color="blue"
              >
                <CheckIcon width="12" height="12" />
                全选
              </Button>
            </Flex>
          </Flex>

          <CheckboxGroup.Root
            value={selectedLines}
            onValueChange={setSelectedLines}
            size="2"
          >
            <Flex gap="2" wrap="wrap">
              {[...lines].map((line) => (
                <CheckboxGroup.Item key={line} value={line}>
                  <Text size="2">{line}</Text>
                </CheckboxGroup.Item>
              ))}
            </Flex>
          </CheckboxGroup.Root>
        </Box>
      )}

      {/* 不良项选择 */}
      {defects.size > 0 && (
        <Box>
          <Flex align="center" justify="between" mb="2">
            <Flex align="center" gap="2">
              <CrumpledPaperIcon
                width="16"
                height="16"
                style={{ color: 'var(--gray-11)' }}
              />
              <Text
                size="3"
                weight="medium"
                style={{ color: 'var(--gray-11)' }}
              >
                不良项
              </Text>
              <Text size="2" style={{ color: 'var(--gray-10)' }}>
                ({selectedDefects.length}/{defects.size})
              </Text>
            </Flex>
            <Flex gap="2">
              {selectedDefects.length > 0 && (
                <Button
                  variant="soft"
                  size="1"
                  color="red"
                  onClick={() => {
                    setSelectedDefects([])
                    setSheet(emptySheet)
                  }}
                >
                  <Cross2Icon width="12" height="12" />
                  清空
                </Button>
              )}
              <Button
                variant="soft"
                size="1"
                onClick={() => setSelectedDefects([...defects])}
                color="blue"
              >
                <CheckIcon width="12" height="12" />
                全选
              </Button>
            </Flex>
          </Flex>

          <CheckboxGroup.Root
            value={selectedDefects}
            onValueChange={setSelectedDefects}
            size="2"
          >
            <Flex gap="2" wrap="wrap">
              {[...defects].map((defect) => (
                <CheckboxGroup.Item key={defect} value={defect}>
                  <Text size="2">{defect}</Text>
                </CheckboxGroup.Item>
              ))}
            </Flex>
          </CheckboxGroup.Root>
        </Box>
      )}
    </Flex>
  )
}

export default SheetFilterPanel
