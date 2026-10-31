import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCheck,
  Clock3,
  Layers,
  Pencil,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react'

import { ChoiceList, ChoiceRadio } from '@/components/ChoiceList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
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
  /** 该页的筛选状态，两类各有自己的实例 */
  filter: PlantFilterStore
  /** 可编辑的类型清单与增删动作 */
  types: string[]
  onAddType: (type: string) => void
  onRemoveType: (type: string) => void
  /**
   * 是否显示「等级」层。利珀的路径里，类型目录外面还包着一层 A/B/C，
   * 力禧特没有这一层。
   */
  levelOptions?: readonly string[]
  /**
   * 时段目录是否个位数补零。利珀是 08/09/00 这种两位写法，
   * 力禧特和 EL 都是不补零的 8/9/0。
   */
  paddedSlots?: boolean
  typePlaceholder: string
  typeExample: string
}

/**
 * 「厂区/机台」类扫描的范围选择：日期、班次、时段、（等级、）不良类型。
 *
 * 这四项的规则跟 EL 基本一致（时段白班 8–19、夜班 20–7，个位数不补零），
 * 所以复用同一套工具函数；类型清单按类别分开存在 userPreferences 里。
 *
 * 类型是必选：为空的类型列表意味着扫出来全是空目录，不如在选的时候就说清楚。
 */
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

  const availableSlots = useMemo(
    () =>
      paddedSlots ? getAllPaddedTimes(shift) : getAllAvailableTimes(shift),
    [shift, paddedSlots],
  )

  const {
    shift: currentShift,
    date: currentDate,
    times: currentSlots,
  } = getShiftInfo(new Date())

  const showLevels = Boolean(levelOptions?.length)

  // 利珀的时段目录补零，带出的默认值也得跟着补，否则一进来就是空结果
  const shapeSlot = useCallback(
    (list: string[]) =>
      paddedSlots ? list.map((item) => item.padStart(2, '0')) : list,
    [paddedSlots],
  )

  useEffect(() => {
    // 首次进入带出当前班次，之后完全由用户控制
    setDate(currentDate)
    setShift(currentShift)
    setSlots(shapeSlot(currentSlots))
    // 等级只有三个，默认全选；用户要收窄时再取消
    if (levelOptions?.length) setLevels([...levelOptions])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 勾选的类型是从 localStorage 恢复的，清单里已经没有的要剔掉，
  // 否则会停在「已选 1 / 共 0」这种点不动的状态
  useEffect(() => {
    if (!selectedTypes.length) return

    const alive = selectedTypes.filter((type) => types.includes(type))

    if (alive.length !== selectedTypes.length) setTypes(alive)
  }, [types, selectedTypes, setTypes])

  const handleShiftChange = (value: string) => {
    if (!value) return

    const next = value as '白班' | '夜班'
    setShift(next)
    // 只有切到当前班次时才带出已过的时段，另一个班次留空让用户自己选
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
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="plant-date">
          <CalendarDays data-icon="inline-start" />
          日期
        </FieldLabel>
        <Input
          id="plant-date"
          type="date"
          value={toDateInputValue(date)}
          onChange={(event) => setDate(event.target.value.replace(/-/g, ''))}
          className="tabular-nums"
        />
      </Field>

      <Field>
        <FieldLabel>班次</FieldLabel>
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

      <Field>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel className="mb-0">
            <Clock3 data-icon="inline-start" />
            时段
            <span className="font-normal text-muted-foreground tabular-nums">
              {slots.length}/{availableSlots.length}
            </span>
          </FieldLabel>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={slots.length === 0}
              onClick={() => setSlots([])}
            >
              清空
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setSlots(availableSlots)}
            >
              <CheckCheck data-icon="inline-start" />
              全选
            </Button>
          </div>
        </div>
        <FieldContent>
          <ChoiceList
            columns={3}
            value={slots}
            onValueChange={setSlots}
            options={availableSlots.map((slot) => ({
              value: slot,
              label: <span className="tabular-nums">{slot}</span>,
            }))}
          />
        </FieldContent>
      </Field>

      {showLevels && (
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel className="mb-0">
              <ShieldCheck data-icon="inline-start" />
              等级
              <span className="font-normal text-muted-foreground tabular-nums">
                {levels.length}/{levelOptions?.length ?? 0}
              </span>
            </FieldLabel>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={levels.length === 0}
                onClick={() => setLevels([])}
              >
                清空
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setLevels([...(levelOptions ?? [])])}
              >
                <CheckCheck data-icon="inline-start" />
                全选
              </Button>
            </div>
          </div>
          <FieldContent>
            <ChoiceList
              columns={3}
              value={levels}
              onValueChange={setLevels}
              options={(levelOptions ?? []).map((level) => ({
                value: level,
                label: level,
              }))}
            />
          </FieldContent>
        </Field>
      )}

      <Field>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel className="mb-0">
            <Layers data-icon="inline-start" />
            类型
            <span className="font-normal text-muted-foreground tabular-nums">
              {selectedTypes.length}/{types.length}
            </span>
          </FieldLabel>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={selectedTypes.length === 0}
              onClick={() => setTypes([])}
            >
              清空
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={!types.length}
              onClick={() => setTypes(types)}
            >
              <CheckCheck data-icon="inline-start" />
              全选
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="ghost" size="xs">
                  <Pencil data-icon="inline-start" />
                  编辑
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>编辑类型</DialogTitle>
                  <DialogDescription>
                    类型名需与目录名完全一致
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap gap-1.5">
                  {types.length ? (
                    types.map((type) => (
                      <Badge
                        key={type}
                        variant="secondary"
                        className="gap-1 pr-1"
                      >
                        {type}
                        <button
                          type="button"
                          onClick={() => {
                            onRemoveType(type)
                            setTypes(
                              selectedTypes.filter((item) => item !== type),
                            )
                          }}
                          aria-label={`删除 ${type}`}
                          className="rounded-sm text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      还没有类型，在下面输入后回车添加
                    </p>
                  )}
                </div>

                <InputGroup>
                  <InputGroupInput
                    placeholder={typePlaceholder}
                    value={newType}
                    onChange={(event) => setNewType(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleAddType()
                      }
                    }}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label="添加类型"
                      disabled={
                        !newType.trim() || types.includes(newType.trim())
                      }
                      onClick={handleAddType}
                    >
                      <Plus />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      关闭
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <FieldContent>
          <ChoiceList
            columns={1}
            value={selectedTypes}
            onValueChange={setTypes}
            options={types.map((type) => ({ value: type, label: type }))}
            empty={`还没有类型，点击「编辑」添加（如 ${typeExample}）`}
          />
        </FieldContent>
      </Field>
    </FieldGroup>
  )
}

export default PlantFilterPanel
