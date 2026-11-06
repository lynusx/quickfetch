import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

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

import { ChoiceList, ChoiceRadio } from '@/components/choice-list'
import { DatePicker } from '@/components/date-picker/date-picker'
import { Field, Step } from '@/components/field'
import type { PlantFilterStore } from '../stores/plantFilterStore'
import { shapeSlot } from './plant-filter-defaults'
import {
  getAllAvailableTimes,
  getAllPaddedTimes,
  getShiftInfo,
} from '@/utils/common'

/**
 * 「厂区 / 机台」类扫描的筛选面板，按 section 组合。
 *
 * 以前用一个 prop 包表达类别差异：hasSlots 决定有没有时段、paddedSlots
 * 决定补零、levelOptions 决定有没有等级，Step 序号也由布尔值推导。
 * 现在基座只剩容器，三个 wrapper 各自组合需要的 section：
 * 森标 AOI 没有时段，力禧特有时段，利珀再多一层等级。
 */

interface PlantFilterPanelProps {
  children: ReactNode
}

/** 面板容器：只负责纵向节奏，section 与顺序由调用方决定 */
const PlantFilterPanel = ({ children }: PlantFilterPanelProps) => (
  <Flex direction="column" gap="5">
    {children}
  </Flex>
)

interface FilterDateShiftProps {
  filter: PlantFilterStore
  index: number
  /** 额外完成条件（利珀：等级也要选）；不传只看日期 */
  extraDone?: boolean
  /** 日期/班次之后的额外字段（利珀的等级） */
  children?: ReactNode
}

/** 日期 + 班次；利珀把等级作为 children 塞进同一个 Step */
export const FilterDateShift = ({
  filter,
  index,
  extraDone = true,
  children,
}: FilterDateShiftProps) => {
  const date = filter((state) => state.date)
  const shift = filter((state) => state.shift)
  const setDate = filter((state) => state.setDate)
  const setShift = filter((state) => state.setShift)

  return (
    <Step index={index} done={Boolean(date) && extraDone}>
      <Flex direction="column" gap="4">
        <Field label="日期" icon={<CalendarIcon width={13} height={13} />}>
          <DatePicker value={date} onChange={setDate} />
        </Field>

        <Field label="班次">
          <ChoiceRadio
            columns={2}
            value={shift}
            onValueChange={(value) => {
              if (value) setShift(value as '白班' | '夜班')
            }}
            options={[
              { value: '白班', label: '白班' },
              { value: '夜班', label: '夜班' },
            ]}
          />
        </Field>

        {children}
      </Flex>
    </Step>
  )
}

interface FilterLevelsProps {
  filter: PlantFilterStore
  options: readonly string[]
}

/** 等级：利珀独有，首次进入默认全选 */
export const FilterLevels = ({ filter, options }: FilterLevelsProps) => {
  const levels = filter((state) => state.levels)
  const setLevels = filter((state) => state.setLevels)
  const seeded = useRef(false)

  useEffect(() => {
    if (seeded.current) return
    seeded.current = true

    if (filter.getState().levels.length === 0) setLevels([...options])
  }, [filter, options, setLevels])

  return (
    <Field
      label="等级"
      icon={<CheckCircledIcon width={13} height={13} />}
      count={`${levels.length}/${options.length}`}
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
            onClick={() => setLevels([...options])}
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
        options={options.map((level) => ({ value: level, label: level }))}
      />
    </Field>
  )
}

interface FilterSlotsProps {
  filter: PlantFilterStore
  index: number
  /** 利珀的时段补零 */
  padded?: boolean
}

/** 时段：力禧特 / 利珀有这一层，切换班次时同步重置 */
export const FilterSlots = ({
  filter,
  index,
  padded = false,
}: FilterSlotsProps) => {
  const shift = filter((state) => state.shift)
  const slots = filter((state) => state.slots)
  const setSlots = filter((state) => state.setSlots)
  const availableSlots = useMemo(
    () => (padded ? getAllPaddedTimes(shift) : getAllAvailableTimes(shift)),
    [shift, padded],
  )

  // 切班次后按「当前班次」重新播种，其余班次清空；跳过首次挂载，
  // 否则会把 usePlantFilterDefaults 播好的值再算一遍
  const prevShift = useRef(shift)

  useLayoutEffect(() => {
    if (prevShift.current === shift) return
    prevShift.current = shift

    const { shift: currentShift, times } = getShiftInfo(new Date())

    setSlots(shift === currentShift ? shapeSlot(times, padded) : [])
  }, [shift, padded, setSlots])

  return (
    <Step index={index} done={slots.length > 0}>
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
  )
}

interface FilterTypesProps {
  filter: PlantFilterStore
  index: number
  types: string[]
  onAddType: (type: string) => void
  onRemoveType: (type: string) => void
  placeholder: string
  example: string
}

/** 类型：三类扫描共用，类型清单由设置页维护 */
export const FilterTypes = ({
  filter,
  index,
  types,
  onAddType,
  onRemoveType,
  placeholder,
  example,
}: FilterTypesProps) => {
  const selectedTypes = filter((state) => state.types)
  const setTypes = filter((state) => state.setTypes)
  const [newType, setNewType] = useState('')

  // 类型清单被编辑后，把已经不存在的类型从选中里剔掉
  useEffect(() => {
    if (!selectedTypes.length) return

    const alive = selectedTypes.filter((type) => types.includes(type))
    if (alive.length !== selectedTypes.length) setTypes(alive)
  }, [types, selectedTypes, setTypes])

  const handleAddType = () => {
    const value = newType.trim()
    if (!value || types.includes(value)) return

    onAddType(value)
    setTypes([...selectedTypes, value])
    setNewType('')
  }

  return (
    <Step index={index} done={selectedTypes.length > 0}>
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
                              setTypes(selectedTypes.filter((t) => t !== type))
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
                  placeholder={placeholder}
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
          empty={`还没有类型，点击「编辑」添加（如 ${example}）`}
        />
      </Field>
    </Step>
  )
}

export default PlantFilterPanel
