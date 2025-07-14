import { useEffect, useMemo, useRef, type FC } from 'react'
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  Cross2Icon,
  UpdateIcon,
} from '@radix-ui/react-icons'
import {
  Box,
  Button,
  CheckboxGroup,
  Flex,
  RadioGroup,
  Text,
  TextField,
} from '@radix-ui/themes'

import { getAllAvailableTimes } from '../../utils/common'

interface TimeRangePickerProps {
  date: string // YYYYMMDD
  shift: '白班' | '夜班'
  times: string[]
  onDateChange: (date: string) => void
  onShiftChange: (shift: '白班' | '夜班') => void
  onTimesChange: (times: string[]) => void
}

const TimeRangePicker: FC<TimeRangePickerProps> = ({
  date,
  shift,
  times,
  onDateChange,
  onShiftChange,
  onTimesChange,
}) => {
  // 当班次变化时重置选择的时段（首次渲染除外）
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    if (times.length > 0) {
      onTimesChange([])
    }
  }, [shift])

  // 缓存所有可选时间
  const availableTimes = useMemo(() => getAllAvailableTimes(shift), [shift])

  // 格式化日期显示 (YYYYMMDD → YYYY-MM-DD)
  const formatDate = (date: string) => {
    if (!date || date.length !== 8) return ''
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
  }

  // 格式化输入日期 (YYYY-MM-DD → YYYYMMDD)
  const handleDateChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const formatted = e.target.value.replace(/-/g, '')
    onDateChange(formatted)
  }

  // 全选
  const handleSelectAllTimes = () => {
    onTimesChange(availableTimes)
  }

  // 清空
  const handleClearTimes = () => {
    onTimesChange([])
  }

  return (
    <Box>
      <Flex direction="column" gap="4">
        {/* 日期选择 */}
        <Box>
          <Flex align="center" gap="2" mb="2">
            <CalendarIcon
              width="16"
              height="16"
              style={{ color: 'var(--gray-11)' }}
            />
            <Text size="3" weight="medium" style={{ color: 'var(--gray-11)' }}>
              日期
            </Text>
          </Flex>
          <TextField.Root
            size="2"
            type="date"
            value={formatDate(date)} // 2025-07-17
            onChange={handleDateChange}
            style={{ maxWidth: '180px' }}
          />
        </Box>

        {/* 班次选择 */}
        <Box>
          <Flex align="center" gap="2" mb="2">
            <UpdateIcon
              width="16"
              height="16"
              style={{ color: 'var(--gray-11)' }}
            />
            <Text size="3" weight="medium" style={{ color: 'var(--gray-11)' }}>
              班次
            </Text>
          </Flex>
          <RadioGroup.Root value={shift} onValueChange={onShiftChange}>
            <Flex gap="4">
              <RadioGroup.Item value="白班">
                <Text size="2">白班 (8:30-20:30)</Text>
              </RadioGroup.Item>
              <RadioGroup.Item value="夜班">
                <Text size="2">夜班 (20:30-8:30)</Text>
              </RadioGroup.Item>
            </Flex>
          </RadioGroup.Root>
        </Box>

        {/* 时间段选择 */}
        <Box>
          <Flex align="center" justify="between" mb="2">
            <Flex align="center" gap="2">
              <ClockIcon
                width="16"
                height="16"
                style={{ color: 'var(--gray-11)' }}
              />
              <Text
                size="3"
                weight="medium"
                style={{ color: 'var(--gray-11)' }}
              >
                时段
              </Text>
              <Text size="2" style={{ color: 'var(--gray-10)' }}>
                ({times.length}/{availableTimes.length})
              </Text>
            </Flex>
            <Flex gap="2">
              {times.length > 0 && (
                <Button
                  variant="soft"
                  size="1"
                  color="red"
                  onClick={handleClearTimes}
                >
                  <Cross2Icon width="12" height="12" />
                  清空
                </Button>
              )}
              <Button
                variant="soft"
                size="1"
                onClick={handleSelectAllTimes}
                color="blue"
              >
                <CheckIcon width="12" height="12" />
                全选
              </Button>
            </Flex>
          </Flex>

          <CheckboxGroup.Root
            value={times}
            onValueChange={onTimesChange}
            size="2"
          >
            <Flex gap="2" wrap="wrap">
              {availableTimes.map((time) => (
                <CheckboxGroup.Item key={time} value={time}>
                  <Text size="2">{time}点</Text>
                </CheckboxGroup.Item>
              ))}
            </Flex>
          </CheckboxGroup.Root>
        </Box>
      </Flex>
    </Box>
  )
}

export default TimeRangePicker
