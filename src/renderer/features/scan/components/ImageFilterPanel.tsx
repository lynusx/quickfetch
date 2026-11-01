import { useEffect, useMemo, useState } from 'react'
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  Cross2Icon,
  LayersIcon,
  Pencil1Icon,
  PlusIcon,
} from '@radix-ui/react-icons'
import {
  Badge,
  Button,
  Dialog,
  Flex,
  IconButton,
  Text,
  TextField,
} from '@radix-ui/themes'

import { ChoiceList, ChoiceRadio } from '@/components/ChoiceList'
import { DatePicker } from '@/components/DatePicker'
import { useImageFilterStore } from '../stores/imageFilterStore'
import { useUserPreferencesStore } from '@/features/settings'
import { getAllAvailableTimes, getShiftInfo } from '@/utils/common'

const ImageFilterPanel = () => {
  const {
    date,
    shift,
    slots,
    types,
    setDate,
    setShift,
    setSlots,
    setTypes,
    removeType,
  } = useImageFilterStore()
  const { ngTypes, addNgType, removeNgType } = useUserPreferencesStore()

  const [newType, setNewType] = useState('')

  // 时段随班次联动：白班 8–19、夜班 20–7，不做两维笛卡尔积
  const availableSlots = useMemo(() => getAllAvailableTimes(shift), [shift])

  const {
    shift: currentShift,
    date: currentDate,
    times: currentSlots,
  } = getShiftInfo(new Date())

  useEffect(() => {
    setDate(currentDate)
    setShift(currentShift)
    setSlots(currentSlots)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!types.length) return
    const alive = types.filter((type) => ngTypes.includes(type))
    if (alive.length !== types.length) setTypes(alive)
  }, [ngTypes, types, setTypes])

  const handleShiftChange = (value: string) => {
    if (!value) return
    const next = value as '白班' | '夜班'
    setShift(next)
    setSlots(next === currentShift ? currentSlots : [])
  }

  const handleAddType = () => {
    const value = newType.trim()
    if (!value || ngTypes.includes(value)) return
    addNgType(value)
    setTypes([...types, value])
    setNewType('')
  }

  const handleRemoveType = (type: string) => {
    removeNgType(type)
    removeType(type)
  }

  return (
    <Flex direction="column" gap="4">
      {/* 日期 */}
      <Flex direction="column" gap="1">
        <Text
          as="label"
          size="2"
          weight="medium"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <CalendarIcon width={14} height={14} />
          日期
        </Text>
        <DatePicker value={date} onChange={setDate} />
      </Flex>

      {/* 班次 */}
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="medium">
          班次
        </Text>
        <ChoiceRadio
          columns={2}
          value={shift}
          onValueChange={handleShiftChange}
          options={[
            { value: '白班', label: '白班' },
            { value: '夜班', label: '夜班' },
          ]}
        />
      </Flex>

      {/* 时段 */}
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center">
          <Flex align="center" gap="2">
            <ClockIcon width={14} height={14} />
            <Text as="label" size="2" weight="medium">
              时段
            </Text>
            <Text size="1" color="gray">
              {slots.length}/{availableSlots.length}
            </Text>
          </Flex>
          <Flex align="center" gap="1">
            <Button
              type="button"
              variant="ghost"
              size="1"
              disabled={slots.length === 0}
              onClick={() => setSlots([])}
            >
              清空
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="1"
              onClick={() => setSlots(availableSlots)}
            >
              <CheckIcon width={14} height={14} />
              全选
            </Button>
          </Flex>
        </Flex>

        <ChoiceList
          columns={3}
          value={slots}
          onValueChange={setSlots}
          options={availableSlots.map((slot) => ({
            value: slot,
            label: <span className="tabular-nums">{slot}</span>,
          }))}
        />
      </Flex>

      {/* 类型 */}
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center">
          <Flex align="center" gap="2">
            <LayersIcon width={14} height={14} />
            <Text as="label" size="2" weight="medium">
              类型
            </Text>
            <Text size="1" color="gray">
              {types.length}/{ngTypes.length}
            </Text>
          </Flex>
          <Flex align="center" gap="1">
            <Button
              type="button"
              variant="ghost"
              size="1"
              disabled={types.length === 0}
              onClick={() => setTypes([])}
            >
              清空
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="1"
              disabled={!ngTypes.length}
              onClick={() => setTypes(ngTypes)}
            >
              <CheckIcon width={14} height={14} />
              全选
            </Button>
            <Dialog.Root>
              <Dialog.Trigger>
                <Button type="button" variant="ghost" size="1">
                  <Pencil1Icon width={14} height={14} />
                  编辑
                </Button>
              </Dialog.Trigger>
              <Dialog.Content maxWidth="450px">
                <Dialog.Title>编辑类型</Dialog.Title>
                <Dialog.Description size="2" color="gray" mb="3">
                  类型名需与目录名完全一致
                </Dialog.Description>

                <Flex wrap="wrap" gap="2" mb="3">
                  {ngTypes.length ? (
                    ngTypes.map((type) => (
                      <Badge
                        key={type}
                        color="gray"
                        variant="soft"
                        size="2"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {type}
                        <IconButton
                          size="1"
                          variant="ghost"
                          color="gray"
                          aria-label={`删除 ${type}`}
                          onClick={() => handleRemoveType(type)}
                          style={{
                            cursor: 'pointer',
                            padding: 0,
                            width: 14,
                            height: 14,
                          }}
                        >
                          <Cross2Icon width={10} height={10} />
                        </IconButton>
                      </Badge>
                    ))
                  ) : (
                    <Text size="2" color="gray">
                      还没有类型，在下面输入后回车添加
                    </Text>
                  )}
                </Flex>

                <TextField.Root
                  size="2"
                  placeholder="NG_脏污_D"
                  value={newType}
                  onChange={(event) => setNewType(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleAddType()
                    }
                  }}
                >
                  <TextField.Slot side="right">
                    <IconButton
                      size="1"
                      variant="ghost"
                      aria-label="添加类型"
                      disabled={
                        !newType.trim() || ngTypes.includes(newType.trim())
                      }
                      onClick={handleAddType}
                    >
                      <PlusIcon width={14} height={14} />
                    </IconButton>
                  </TextField.Slot>
                </TextField.Root>

                <Flex justify="end" mt="4">
                  <Dialog.Close>
                    <Button type="button" variant="soft" color="gray">
                      关闭
                    </Button>
                  </Dialog.Close>
                </Flex>
              </Dialog.Content>
            </Dialog.Root>
          </Flex>
        </Flex>

        <ChoiceList
          columns={1}
          value={types}
          onValueChange={setTypes}
          options={ngTypes.map((type) => ({ value: type, label: type }))}
          empty="还没有类型，点击「编辑」添加（如 NG_脏污_B）"
        />
      </Flex>
    </Flex>
  )
}

export default ImageFilterPanel
