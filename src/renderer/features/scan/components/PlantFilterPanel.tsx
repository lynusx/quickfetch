import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarIcon,
  CheckCircledIcon,
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
import type { PlantFilterStore } from '../stores/plantFilterStore'
import {
  getAllAvailableTimes,
  getAllPaddedTimes,
  getShiftInfo,
} from '@/utils/common'

// YYYYMMDD → YYYY-MM-DD
const toDateInputValue = (date: string) => {
  if (!date || date.length !== 8) return ''
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}

interface PlantFilterPanelProps {
  filter: PlantFilterStore
  types: string[]
  onAddType: (type: string) => void
  onRemoveType: (type: string) => void
  levelOptions?: readonly string[]
  paddedSlots?: boolean
  typePlaceholder: string
  typeExample: string
}

const PlantFilterPanel = ({
  filter,
  types,
  onAddType,
  onRemoveType,
  levelOptions,
  paddedSlots = false,
  typePlaceholder,
  typeExample,
}: PlantFilterPanelProps) => {
  const date = filter((state) => state.date)
  const shift = filter((state) => state.shift)
  const slots = filter((state) => state.slots)
  const selectedTypes = filter((state) => state.types)
  const levels = filter((state) => state.levels)
  const setDate = filter((state) => state.setDate)
  const setShift = filter((state) => state.setShift)
  const setSlots = filter((state) => state.setSlots)
  const setTypes = filter((state) => state.setTypes)
  const setLevels = filter((state) => state.setLevels)

  const [newType, setNewType] = useState('')

  const availableSlots = useMemo(() => {
    return paddedSlots ? getAllPaddedTimes(shift) : getAllAvailableTimes(shift)
  }, [shift, paddedSlots])

  const {
    shift: currentShift,
    date: currentDate,
    times: currentSlots,
  } = getShiftInfo(new Date())

  const shapeSlot = useCallback(
    (list: string[]) =>
      paddedSlots ? list.map((item) => item.padStart(2, '0')) : list,
    [paddedSlots],
  )

  useEffect(() => {
    setDate(currentDate)
    setShift(currentShift)
    setSlots(shapeSlot(currentSlots))
    if (levelOptions?.length && levels.length === 0) {
      setLevels([...levelOptions])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedTypes.length) return
    const alive = selectedTypes.filter((type) => types.includes(type))
    if (alive.length !== selectedTypes.length) setTypes(alive)
  }, [types, selectedTypes, setTypes])

  const handleShiftChange = (value: string) => {
    if (!value) return
    const next = value as '白班' | '夜班'
    setShift(next)
    setSlots(next === currentShift ? shapeSlot(currentSlots) : [])
  }

  const handleAddType = () => {
    const value = newType.trim()
    if (!value || types.includes(value)) return
    onAddType(value)
    setTypes([...selectedTypes, value])
    setNewType('')
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
        <TextField.Root
          type="date"
          size="2"
          value={toDateInputValue(date)}
          onChange={(event) => setDate(event.target.value.replace(/-/g, ''))}
          style={{ fontFamily: 'var(--code-font-family)' }}
        />
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

      {/* 等级（利珀独有） */}
      {levelOptions && levelOptions.length > 0 && (
        <Flex direction="column" gap="2">
          <Flex justify="between" align="center">
            <Flex align="center" gap="2">
              <CheckCircledIcon width={14} height={14} />
              <Text as="label" size="2" weight="medium">
                等级
              </Text>
              <Text size="1" color="gray">
                {levels.length}/{levelOptions.length}
              </Text>
            </Flex>
            <Flex align="center" gap="1">
              <Button
                type="button"
                variant="ghost"
                size="1"
                disabled={levels.length === 0}
                onClick={() => setLevels([])}
              >
                清空
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="1"
                onClick={() => setLevels([...levelOptions])}
              >
                <CheckIcon width={14} height={14} />
                全选
              </Button>
            </Flex>
          </Flex>

          <ChoiceList
            columns={3}
            value={levels}
            onValueChange={setLevels}
            options={levelOptions.map((level) => ({
              value: level,
              label: level,
            }))}
          />
        </Flex>
      )}

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
              {selectedTypes.length}/{types.length}
            </Text>
          </Flex>
          <Flex align="center" gap="1">
            <Button
              type="button"
              variant="ghost"
              size="1"
              disabled={selectedTypes.length === 0}
              onClick={() => setTypes([])}
            >
              清空
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="1"
              disabled={!types.length}
              onClick={() => setTypes(types)}
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
                  {types.length ? (
                    types.map((type) => (
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
                          onClick={() => {
                            onRemoveType(type)
                            setTypes(selectedTypes.filter((t) => t !== type))
                          }}
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
                  placeholder={typePlaceholder}
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
                        !newType.trim() || types.includes(newType.trim())
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
          value={selectedTypes}
          onValueChange={setTypes}
          options={types.map((type) => ({ value: type, label: type }))}
          empty={`还没有类型，点击「编辑」添加（如 ${typeExample}）`}
        />
      </Flex>
    </Flex>
  )
}

export default PlantFilterPanel
