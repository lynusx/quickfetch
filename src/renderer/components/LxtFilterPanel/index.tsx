import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCheck, Clock3, Layers, Plus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useLxtFilterStore } from '@/stores/lxtFilterStore'
import { useUserPreferencesStore } from '@/stores/userPreferencesStore'
import { getAllAvailableTimes, getShiftInfo } from '@/utils/common'

// YYYYMMDD → YYYY-MM-DD
const toDateInputValue = (date: string) => {
  if (!date || date.length !== 8) return ''
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}

/**
 * 力禧特扫描范围：日期、班次、时段、不良类型。
 *
 * 这四项的规则跟 EL 完全一致（时段白班 8–19、夜班 20–7，个位数不补零），
 * 所以复用同一套工具函数；只有类型清单是分开存的 —— 两类的命名规则不同。
 *
 * 类型是必选：为空的类型列表意味着扫出来全是空目录，不如在选的时候就说清楚。
 */
const LxtFilterPanel = () => {
  const { date, shift, slots, types, setDate, setShift, setSlots, setTypes } =
    useLxtFilterStore()
  const { lxtTypes, addLxtType, removeLxtType } = useUserPreferencesStore()

  const [newType, setNewType] = useState('')

  const availableSlots = useMemo(() => getAllAvailableTimes(shift), [shift])

  const {
    shift: currentShift,
    date: currentDate,
    times: currentSlots,
  } = getShiftInfo(new Date())

  useEffect(() => {
    // 首次进入带出当前班次，之后完全由用户控制
    setDate(currentDate)
    setShift(currentShift)
    setSlots(currentSlots)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleShiftChange = (value: string) => {
    if (!value) return

    const next = value as '白班' | '夜班'
    setShift(next)
    setSlots(next === currentShift ? currentSlots : [])
  }

  const handleAddType = () => {
    const value = newType.trim()
    if (!value || lxtTypes.includes(value)) return

    addLxtType(value)
    setTypes([...types, value])
    setNewType('')
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="lxt-date">
          <CalendarDays data-icon="inline-start" />
          日期
        </FieldLabel>
        <Input
          id="lxt-date"
          type="date"
          value={toDateInputValue(date)}
          onChange={(event) => setDate(event.target.value.replace(/-/g, ''))}
          className="tabular-nums"
        />
      </Field>

      <Field>
        <FieldLabel>班次</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          value={shift}
          onValueChange={handleShiftChange}
          className="w-full"
        >
          <ToggleGroupItem value="白班" className="flex-1">
            白班
          </ToggleGroupItem>
          <ToggleGroupItem value="夜班" className="flex-1">
            夜班
          </ToggleGroupItem>
        </ToggleGroup>
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
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            value={slots}
            onValueChange={setSlots}
            className="grid grid-cols-6 gap-1.5"
          >
            {availableSlots.map((slot) => (
              <ToggleGroupItem
                key={slot}
                value={slot}
                className="h-8 w-full tabular-nums"
              >
                {slot}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldContent>
      </Field>

      <Field>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel className="mb-0">
            <Layers data-icon="inline-start" />
            类型
            <span className="font-normal text-muted-foreground tabular-nums">
              {types.length}/{lxtTypes.length}
            </span>
          </FieldLabel>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={types.length === 0}
              onClick={() => setTypes([])}
            >
              清空
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={!lxtTypes.length}
              onClick={() => setTypes(lxtTypes)}
            >
              <CheckCheck data-icon="inline-start" />
              全选
            </Button>
          </div>
        </div>
        <FieldContent>
          {lxtTypes.length ? (
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              value={types}
              onValueChange={setTypes}
              className="flex flex-wrap gap-1.5"
            >
              {lxtTypes.map((type) => (
                <ToggleGroupItem key={type} value={type} className="h-8 gap-1">
                  {type}
                  <button
                    type="button"
                    aria-label={`删除 ${type}`}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      removeLxtType(type)
                      setTypes(types.filter((item) => item !== type))
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : (
            <p className="text-xs text-muted-foreground">
              还没有类型，输入目录名后回车添加（如 NG_脏污_A-）
            </p>
          )}
        </FieldContent>

        <InputGroup>
          <InputGroupInput
            placeholder="NG_脏污_A-"
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
              disabled={!newType.trim() || lxtTypes.includes(newType.trim())}
              onClick={handleAddType}
            >
              <Plus />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        {types.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {types.map((type) => (
              <Badge key={type} variant="secondary">
                {type}
              </Badge>
            ))}
          </div>
        )}
      </Field>
    </FieldGroup>
  )
}

export default LxtFilterPanel
