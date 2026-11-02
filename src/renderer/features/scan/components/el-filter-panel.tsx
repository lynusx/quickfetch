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

import { ChoiceList, ChoiceRadio } from '@/components/choice-list'
import { DatePicker } from '@/components/date-picker/date-picker'
import { Field, Step } from '@/components/field'
import { useImageFilterStore } from '../stores/imageFilterStore'
import { useUserPreferencesStore } from '@/features/settings'
import { getAllAvailableTimes, getShiftInfo } from '@/utils/common'

const ElFilterPanel = () => {
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
    <Flex direction="column" gap="5">
      <Step index={3} done={Boolean(date) && slots.length > 0}>
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
        </Flex>
      </Step>

      <Step index={4} done={types.length > 0}>
        <Field
          label="类型"
          icon={<LayersIcon width={13} height={13} />}
          count={`${types.length}/${ngTypes.length}`}
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                disabled={types.length === 0}
                onClick={() => setTypes([])}
              >
                清空
              </Button>
              <Button
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                disabled={!ngTypes.length}
                onClick={() => setTypes(ngTypes)}
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
                    类型名需与目录名完全一致，例如 NG_脏污_D
                  </Dialog.Description>

                  <Flex wrap="wrap" gap="2" mb="3">
                    {ngTypes.length ? (
                      ngTypes.map((type) => (
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
                              onClick={() => handleRemoveType(type)}
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
            </>
          }
        >
          <ChoiceList
            columns={1}
            value={types}
            onValueChange={setTypes}
            options={ngTypes.map((type) => ({ value: type, label: type }))}
            empty="还没有类型，点击「编辑」添加（如 NG_脏污_B）"
          />
        </Field>
      </Step>
    </Flex>
  )
}

export default ElFilterPanel
