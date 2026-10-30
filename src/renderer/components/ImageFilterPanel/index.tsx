import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCheck,
  Clock3,
  Layers,
  Pencil,
  Plus,
  X,
} from 'lucide-react'

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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useImageFilterStore } from '@/stores/imageFilterStore'
import { useUserPreferencesStore } from '@/stores/userPreferencesStore'
import { getAllAvailableTimes, getShiftInfo } from '@/utils/common'

// YYYYMMDD → YYYY-MM-DD
const toDateInputValue = (date: string) => {
  if (!date || date.length !== 8) return ''
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}

const ImageFilterPanel = () => {
  const { date, shift, slots, types, setDate, setShift, setSlots, setTypes } =
    useImageFilterStore()
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
    // 仅在挂载时带出当前班次，之后完全由用户控制
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleShiftChange = (value: string) => {
    if (!value) return

    const next = value as '白班' | '夜班'
    setShift(next)
    // 切班次后原时段不再合法，切回当前班次时恢复默认时段
    setSlots(next === currentShift ? currentSlots : [])
  }

  const handleAddType = () => {
    const value = newType.trim()
    if (!value || ngTypes.includes(value)) return

    addNgType(value)
    setNewType('')
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="scan-date">
          <CalendarDays data-icon="inline-start" />
          日期
        </FieldLabel>
        <Input
          id="scan-date"
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
              {types.length}/{ngTypes.length}
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
              onClick={() => setTypes(ngTypes)}
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
                  {ngTypes.map((type) => (
                    <Badge
                      key={type}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      {type}
                      <button
                        type="button"
                        onClick={() => removeNgType(type)}
                        aria-label={`删除 ${type}`}
                        className="rounded-sm text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>

                <InputGroup>
                  <InputGroupInput
                    placeholder="NG_脏污_D"
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
                        !newType.trim() || ngTypes.includes(newType.trim())
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
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            value={types}
            onValueChange={setTypes}
            className="flex flex-wrap gap-1.5"
          >
            {ngTypes.map((type) => (
              <ToggleGroupItem key={type} value={type} className="h-8">
                {type}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldContent>
      </Field>
    </FieldGroup>
  )
}

export default ImageFilterPanel
