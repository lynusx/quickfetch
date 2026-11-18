import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
  Calendar,
  CircleCheck,
  Clock,
  Layers,
  Pencil,
  Plus,
  X,
} from 'lucide-react'
import {
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  IconButton,
  Text,
  TextField,
} from '@radix-ui/themes'

import { BulkActions } from '@/components/bulk-actions/bulk-actions'
import { ChoiceList, ChoiceRadio } from '@/components/choice-list'
import { DatePicker } from '@/components/date-picker/date-picker'
import { Field } from '@/components/field'
import type { PlantFilterStore } from '../stores/plantFilterStore'
import { shapeSlot } from './plant-filter-defaults'
import {
  getAllAvailableTimes,
  getAllPaddedTimes,
  getShiftInfo,
} from '@/utils/common'

/**
 * 「厂区 / 机台」类扫描的筛选面板，单列纵向排布。
 *
 * 日期（定宽）与班次在宽屏下同行并排，其余字段各占一整行，
 * 选项采用轻量无边框横向流式排列（ChoiceRadio / ChoiceList layout="inline"）。
 */

interface PlantFilterPanelProps {
  children: ReactNode
}

/** 面板容器：单列纵向表单流，section 与顺序由调用方决定 */
const PlantFilterPanel = ({ children }: PlantFilterPanelProps) => (
  <Flex direction="column" gap="4">
    {children}
  </Flex>
)

interface FilterDateShiftProps {
  filter: PlantFilterStore
  /** 日期/班次之后的额外字段（EL 的时段、利珀的等级） */
  children?: ReactNode
}

/** 日期 + 班次同行并排（窄屏自动折行）；EL 时段、利珀等级紧随其后 */
export const FilterDateShift = ({ filter, children }: FilterDateShiftProps) => {
  const date = filter((state) => state.date)
  const shift = filter((state) => state.shift)
  const setDate = filter((state) => state.setDate)
  const setShift = filter((state) => state.setShift)

  return (
    <Flex direction="column" gap="4">
      <Flex wrap="wrap" align="start" gapX="6" gapY="4">
        <Box width="220px" flexShrink="0">
          <Field label="日期" icon={<Calendar size={15} strokeWidth={1.75} />}>
            <DatePicker value={date} onChange={setDate} />
          </Field>
        </Box>

        <Field label="班次">
          <Box py="1">
            <ChoiceRadio
              layout="inline"
              value={shift}
              onValueChange={(value) => {
                if (value) setShift(value as '白班' | '夜班')
              }}
              options={[
                { value: '白班', label: '白班' },
                { value: '夜班', label: '夜班' },
              ]}
            />
          </Box>
        </Field>
      </Flex>

      {children}
    </Flex>
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
      icon={<CircleCheck size={15} strokeWidth={1.75} />}
      count={`${levels.length}/${options.length}`}
      actions={
        <BulkActions
          onToggleAll={() =>
            setLevels(levels.length === options.length ? [] : [...options])
          }
          allSelected={options.length > 0 && levels.length === options.length}
          toggleDisabled={options.length === 0}
          cancelLabel="清空"
          toggleIcon
        />
      }
    >
      <ChoiceList
        layout="inline"
        value={levels}
        onValueChange={setLevels}
        options={options.map((level) => ({ value: level, label: level }))}
      />
    </Field>
  )
}

interface FilterSlotsFieldProps {
  filter: PlantFilterStore
  /** 利珀的时段补零 */
  padded?: boolean
}

/** 时段字段本体 */
export const FilterSlotsField = ({
  filter,
  padded = false,
}: FilterSlotsFieldProps) => {
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
    <Field
      label="时段"
      icon={<Clock size={15} strokeWidth={1.75} />}
      count={`${slots.length}/${availableSlots.length}`}
      actions={
        <BulkActions
          onToggleAll={() =>
            setSlots(
              slots.length === availableSlots.length ? [] : availableSlots,
            )
          }
          allSelected={
            availableSlots.length > 0 && slots.length === availableSlots.length
          }
          toggleDisabled={availableSlots.length === 0}
          cancelLabel="清空"
          toggleIcon
        />
      }
    >
      <ChoiceList
        layout="inline"
        value={slots}
        onValueChange={setSlots}
        options={availableSlots.map((slot) => ({
          value: slot,
          label: slot,
        }))}
      />
    </Field>
  )
}

/** 时段区块（力禧特 / 利珀与日期班次同列纵向排布） */
export const FilterSlots = ({
  filter,
  padded = false,
}: FilterSlotsFieldProps) => (
  <FilterSlotsField filter={filter} padded={padded} />
)

interface FilterTypesProps {
  filter: PlantFilterStore
  types: string[]
  /**
   * 清单是否已从配置读回。
   *
   * 配置是异步读的：首帧 catalog 还是空数组，若此时就跑下面的「剔除不存在
   * 的类型」，会把 localStorage 里刚恢复的勾选全部清掉。读回之前先不裁。
   */
  catalogReady?: boolean
  onAddType: (type: string) => void
  onRemoveType: (type: string) => void
  placeholder: string
  example: string
}

/** 类型：四类扫描共用，类型清单由设置页/本弹窗维护 */
export const FilterTypes = ({
  filter,
  types,
  catalogReady = true,
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
    if (!catalogReady || !selectedTypes.length) return

    const alive = selectedTypes.filter((type) => types.includes(type))
    if (alive.length !== selectedTypes.length) setTypes(alive)
  }, [catalogReady, types, selectedTypes, setTypes])

  const handleAddType = () => {
    const value = newType.trim()
    if (!value || types.includes(value)) return

    onAddType(value)
    setTypes([...selectedTypes, value])
    setNewType('')
  }

  return (
    <Field
      label="类型"
      icon={<Layers size={15} strokeWidth={1.75} />}
      count={`${selectedTypes.length}/${types.length}`}
      actions={
        <BulkActions
          onToggleAll={() =>
            setTypes(selectedTypes.length === types.length ? [] : types)
          }
          allSelected={
            types.length > 0 && selectedTypes.length === types.length
          }
          toggleDisabled={!types.length}
          cancelLabel="清空"
          toggleIcon
          extra={
            <Dialog.Root>
              <Dialog.Trigger>
                <Button type="button" variant="soft" color="gray">
                  <Pencil size={14} strokeWidth={1.75} />
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
                      <Badge key={type} color="gray" size="2">
                        <Flex align="center" gap="1">
                          <Text size="1">{type}</Text>
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
                            <X size={10} strokeWidth={1.75} />
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
                      <Plus size={14} strokeWidth={1.75} />
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
          }
        />
      }
    >
      <ChoiceList
        layout="inline"
        value={selectedTypes}
        onValueChange={setTypes}
        options={types.map((type) => ({ value: type, label: type }))}
        empty={`还没有类型，点击「编辑」添加（如 ${example}）`}
      />
    </Field>
  )
}

export default PlantFilterPanel
