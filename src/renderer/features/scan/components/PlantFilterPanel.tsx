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
import { DatePicker } from '@/components/DatePicker'
import { Field, Step } from '@/components/Field'
import type { PlantFilterStore } from '../stores/plantFilterStore'
import {
  getAllAvailableTimes,
  getAllPaddedTimes,
  getShiftInfo,
} from '@/utils/common'

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
    <Flex direction="column" gap="5">
      <Step
        index={3}
        done={Boolean(date) && (!levelOptions?.length || levels.length > 0)}
      >
        <Flex direction="column" gap="4">
          <Field label="日期" icon={<CalendarIcon width={13} height={13} />}>
            <DatePicker value={date} onChange={setDate} />
          </Field>

          <Field label="班次">
            <ChoiceRadio
              columns={2}
              value={shift}
              onValueChange={handleShiftChange}
              options={[
                { value: '白班', label: '白班' },
                { value: '夜班', label: '夜班' },
              ]}
            />
          </Field>

          {/* 等级（利珀独有） */}
          {levelOptions && levelOptions.length > 0 && (
            <Field
              label="等级"
              icon={<CheckCircledIcon width={13} height={13} />}
              count={`${levels.length}/${levelOptions.length}`}
              actions={
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    color="gray"
                    size="1"
                    disabled={levels.length === 0}
                    onClick={() => setLevels([])}
                  >
                    清空
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    color="gray"
                    size="1"
                    onClick={() => setLevels([...levelOptions])}
                  >
                    <CheckIcon width={13} height={13} />
                    全选
                  </Button>
                </>
              }
            >
              <ChoiceList
                columns={3}
                value={levels}
                onValueChange={setLevels}
                options={levelOptions.map((level) => ({
                  value: level,
                  label: level,
                }))}
              />
            </Field>
          )}
        </Flex>
      </Step>

      <Step index={4} done={slots.length > 0}>
        <Field
          label="时段"
          icon={<ClockIcon width={13} height={13} />}
          count={`${slots.length}/${availableSlots.length}`}
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                disabled={slots.length === 0}
                onClick={() => setSlots([])}
              >
                清空
              </Button>
              <Button
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                onClick={() => setSlots(availableSlots)}
              >
                <CheckIcon width={13} height={13} />
                全选
              </Button>
            </>
          }
        >
          <ChoiceList
            columns={3}
            value={slots}
            onValueChange={setSlots}
            options={availableSlots.map((slot) => ({
              value: slot,
              label: slot,
            }))}
          />
        </Field>
      </Step>

      <Step index={5} done={selectedTypes.length > 0}>
        <Field
          label="类型"
          icon={<LayersIcon width={13} height={13} />}
          count={`${selectedTypes.length}/${types.length}`}
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                disabled={selectedTypes.length === 0}
                onClick={() => setTypes([])}
              >
                清空
              </Button>
              <Button
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                disabled={!types.length}
                onClick={() => setTypes(types)}
              >
                <CheckIcon width={13} height={13} />
                全选
              </Button>
              <Dialog.Root>
                <Dialog.Trigger>
                  <Button type="button" variant="ghost" color="gray" size="1">
                    <Pencil1Icon width={13} height={13} />
                    编辑
                  </Button>
                </Dialog.Trigger>
                <Dialog.Content maxWidth="460px">
                  <Dialog.Title>编辑类型</Dialog.Title>
                  <Dialog.Description size="2" color="gray" mb="3">
                    类型名需与目录名完全一致
                  </Dialog.Description>

                  <Flex wrap="wrap" gap="2" mb="3">
                    {types.length ? (
                      types.map((type) => (
                        <Badge key={type} color="gray" variant="soft" size="2">
                          <Flex align="center" gap="1">
                            <Text as="span" size="1">
                              {type}
                            </Text>
                            <IconButton
                              size="1"
                              variant="ghost"
                              color="gray"
                              aria-label={`删除 ${type}`}
                              onClick={() => {
                                onRemoveType(type)
                                setTypes(
                                  selectedTypes.filter((t) => t !== type),
                                )
                              }}
                            >
                              <Cross2Icon width={10} height={10} />
                            </IconButton>
                          </Flex>
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
            </>
          }
        >
          <ChoiceList
            columns={1}
            value={selectedTypes}
            onValueChange={setTypes}
            options={types.map((type) => ({ value: type, label: type }))}
            empty={`还没有类型，点击「编辑」添加（如 ${typeExample}）`}
          />
        </Field>
      </Step>
    </Flex>
  )
}

export default PlantFilterPanel
