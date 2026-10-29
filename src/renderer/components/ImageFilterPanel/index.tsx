import { useEffect, useMemo, useState } from 'react'
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  Cross2Icon,
  UpdateIcon,
  CodeIcon,
  Pencil2Icon,
  PlusIcon,
  Cross1Icon,
} from '@radix-ui/react-icons'
import {
  Box,
  Button,
  Badge,
  CheckboxGroup,
  Flex,
  RadioGroup,
  Text,
  TextField,
  Dialog,
  IconButton,
} from '@radix-ui/themes'

import { getAllAvailableTimes, getShiftInfo } from '../../utils/common'
import { useImageFilterStore } from '../../stores/imageFilterStore'
import { useUserPreferencesStore } from '../../stores/userPreferencesStore'

const ImageFilterPanel = () => {
  const {
    plant,
    date,
    shift,
    types,
    times,
    setPlant,
    setDate,
    setShift,
    setTimes,
    setTypes,
  } = useImageFilterStore()
  const { ngTypes, addNgType, removeNgType } = useUserPreferencesStore()

  const [newType, setNewType] = useState('')
  const handleAddType = () => {
    const val = newType.trim()
    if (val && !ngTypes.includes(val)) {
      addNgType(val)
      setNewType('')
    }
  }

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
    setDate(formatted)
  }

  const { shift: Tshift, date: Tdate, times: Ttimes } = getShiftInfo(new Date())

  useEffect(() => {
    // 初始化日期、班次、时间段
    if (!date) setDate(Tdate)
    if (!shift) setShift(Tshift)
    if (times.length === 0) setTimes(Ttimes)
  }, [])

  const handleShiftChange = (value: '白班' | '夜班') => {
    setShift(value)
    value !== Tshift ? setTimes([]) : setTimes(Ttimes)
  }

  return (
    <Flex direction="column" gap="4">
      {/* 厂区选择 */}
      <Box>
        <Flex align="center" gap="2" mb="2">
          <CodeIcon
            width="16"
            height="16"
            style={{ color: 'var(--gray-11)' }}
          />
          <Text size="3" weight="medium" style={{ color: 'var(--gray-11)' }}>
            厂区
          </Text>
        </Flex>
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
      </Box>

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
        <RadioGroup.Root value={shift} onValueChange={handleShiftChange}>
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
            <Text size="3" weight="medium" style={{ color: 'var(--gray-11)' }}>
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
                onClick={() => setTimes([])}
              >
                <Cross2Icon width="12" height="12" />
                清空
              </Button>
            )}
            <Button
              variant="soft"
              size="1"
              onClick={() => setTimes(availableTimes)}
              color="blue"
            >
              <CheckIcon width="12" height="12" />
              全选
            </Button>
          </Flex>
        </Flex>

        <CheckboxGroup.Root value={times} onValueChange={setTimes} size="2">
          <Flex gap="2" wrap="wrap">
            {availableTimes.map((time) => (
              <CheckboxGroup.Item key={time} value={time}>
                <Text size="2">{time}点</Text>
              </CheckboxGroup.Item>
            ))}
          </Flex>
        </CheckboxGroup.Root>
      </Box>

      {/* 类型选择 */}
      <Box>
        <Flex align="center" justify="between" mb="2">
          <Flex align="center" gap="2">
            <ClockIcon
              width="16"
              height="16"
              style={{ color: 'var(--gray-11)' }}
            />
            <Text size="3" weight="medium" style={{ color: 'var(--gray-11)' }}>
              类型
            </Text>
            <Text size="2" style={{ color: 'var(--gray-10)' }}>
              ({types.length}/{ngTypes.length})
            </Text>
          </Flex>
          <Flex gap="2">
            <Dialog.Root>
              <Dialog.Trigger>
                <Button variant="soft" size="1">
                  <Pencil2Icon width="12" height="12" />
                  编辑
                </Button>
              </Dialog.Trigger>
              <Dialog.Content maxWidth="450px">
                <Dialog.Title>编辑类型</Dialog.Title>
                <Dialog.Description size="2" mb="4">
                  自定义图片类型，支持添加/删除
                </Dialog.Description>

                <Flex gap="2" wrap="wrap" mb="3">
                  {ngTypes.length === 0 ? (
                    <Text size="2" color="gray">
                      暂无类型，请添加
                    </Text>
                  ) : (
                    ngTypes.map((type) => (
                      <Badge
                        variant="soft"
                        key={type}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {type}
                        <IconButton
                          size="1"
                          variant="ghost"
                          color="red"
                          style={{ marginLeft: 4 }}
                          onClick={() => removeNgType(type)}
                          aria-label={`删除${type}`}
                        >
                          <Cross1Icon height="12" width="12" />
                        </IconButton>
                      </Badge>
                    ))
                  )}
                </Flex>

                <Flex gap="2" align="center" mb="2">
                  <TextField.Root
                    placeholder="新增类型"
                    size="2"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    style={{ flex: 1 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddType()
                    }}
                  >
                    <TextField.Slot side="right" px="2">
                      <IconButton
                        size="1"
                        variant="soft"
                        color="blue"
                        onClick={handleAddType}
                        disabled={
                          !newType.trim() || ngTypes.includes(newType.trim())
                        }
                        aria-label="添加类型"
                      >
                        <PlusIcon height="14" width="14" />
                      </IconButton>
                    </TextField.Slot>
                  </TextField.Root>
                </Flex>

                <Flex gap="3" mt="4" justify="end">
                  <Dialog.Close>
                    <Button variant="soft" color="gray">
                      关闭
                    </Button>
                  </Dialog.Close>
                </Flex>
              </Dialog.Content>
            </Dialog.Root>

            {types.length > 0 && (
              <Button
                variant="soft"
                size="1"
                color="red"
                onClick={() => setTypes([])}
              >
                <Cross2Icon width="12" height="12" />
                清空
              </Button>
            )}
            <Button variant="soft" size="1" onClick={() => setTypes(ngTypes)}>
              <CheckIcon width="12" height="12" />
              全选
            </Button>
          </Flex>
        </Flex>

        <CheckboxGroup.Root value={types} onValueChange={setTypes} size="2">
          <Flex gap="2" wrap="wrap" align="center">
            {ngTypes.map((type) => (
              <CheckboxGroup.Item key={type} value={type}>
                <Flex gap="2" align="center">
                  <Text size="2">{type}</Text>
                </Flex>
              </CheckboxGroup.Item>
            ))}
          </Flex>
        </CheckboxGroup.Root>
      </Box>
    </Flex>
  )
}

export default ImageFilterPanel
