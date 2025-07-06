import { useState, type FC } from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  CheckboxGroup,
  Flex,
  Separator,
  Text,
} from '@radix-ui/themes'
import { MixerHorizontalIcon, ResetIcon } from '@radix-ui/react-icons'

interface FilterPanelProps {
  lines: Set<string>
  defects: Set<string>
  selectedLines: string[]
  selectedDefects: string[]
  onLinesChange: (lines: string[]) => void
  onDefectsChange: (defects: string[]) => void
}

const FilterPanel: FC<FilterPanelProps> = ({
  lines,
  defects,
  selectedLines,
  selectedDefects,
  onLinesChange,
  onDefectsChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const handleReset = () => {
    onLinesChange([...lines])
    onDefectsChange([...defects])
  }

  return (
    <Card mb="3" style={{ background: 'var(--gray-2)' }}>
      <Flex align="center" justify="between" mb="3">
        <Flex align="center" gap="2">
          <MixerHorizontalIcon
            width="16"
            height="16"
            style={{ color: 'var(--blue-9)' }}
          />
          <Text size="2" weight="bold">
            数据筛选
          </Text>
          <Badge variant="soft" color="blue">
            {selectedLines.length + selectedDefects.length}项已选
          </Badge>
        </Flex>

        <Flex align="center" gap="2">
          <Button variant="soft" size="1" onClick={handleReset}>
            <ResetIcon width="16" height="16" />
            <Text size="1">重置</Text>
          </Button>
          <Button
            variant="soft"
            size="1"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? '收起' : '展开'}
          </Button>
        </Flex>
      </Flex>

      {isExpanded && (
        <>
          <Separator size="4" mb="3" />
          <Flex direction="column" gap="4">
            {/* 线别筛选 */}
            <Box>
              <Flex align="center" gap="2" mb="2">
                <Text
                  size="2"
                  weight="medium"
                  style={{ color: 'var(--gray-12)' }}
                >
                  线别筛选
                </Text>
                <Badge variant="soft" size="1">
                  {lines.size}个选项
                </Badge>
                {selectedLines.length > 0 && (
                  <Badge variant="soft" color="blue" size="1">
                    已选{selectedLines.length}
                  </Badge>
                )}
              </Flex>
              {lines.size > 0 && (
                <CheckboxGroup.Root
                  value={selectedLines}
                  onValueChange={onLinesChange}
                >
                  <Flex wrap="wrap" gap="2">
                    {Array.from(lines).map((line) => (
                      <CheckboxGroup.Item
                        key={line}
                        value={line}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                        }}
                      >
                        {line}
                      </CheckboxGroup.Item>
                    ))}
                  </Flex>
                </CheckboxGroup.Root>
              )}
            </Box>

            {/* 不良项筛选 */}
            <Box>
              <Flex align="center" gap="2" mb="2">
                <Text
                  size="2"
                  weight="medium"
                  style={{ color: 'var(--gray-12)' }}
                >
                  不良项筛选
                </Text>
                <Badge variant="soft" size="1">
                  {defects.size}个选项
                </Badge>
                {selectedDefects.length > 0 && (
                  <Badge variant="soft" color="blue" size="1">
                    已选{selectedDefects.length}
                  </Badge>
                )}
              </Flex>
              {defects.size > 0 && (
                <CheckboxGroup.Root
                  value={selectedDefects}
                  onValueChange={onDefectsChange}
                >
                  <Flex wrap="wrap" gap="2">
                    {Array.from(defects).map((defect) => (
                      <CheckboxGroup.Item
                        key={defect}
                        value={defect}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                        }}
                      >
                        {defect}
                      </CheckboxGroup.Item>
                    ))}
                  </Flex>
                </CheckboxGroup.Root>
              )}
            </Box>
          </Flex>
        </>
      )}
    </Card>
  )
}

export default FilterPanel
