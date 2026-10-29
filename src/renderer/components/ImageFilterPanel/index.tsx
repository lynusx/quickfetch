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
  FieldDescription,
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

  // 缓存所有可选时间
  const availableTimes = useMemo(() => getAllAvailableTimes(shift), [shift])

  // 当天班次信息，用于「切回当前班次时恢复默认时段」
  const {
    shift: currentShift,
    date: currentDate,
    times: currentTimes,
  } = getShiftInfo(new Date())

  useEffect(() => {
    if (!date) setDate(currentDate)
    if (!shift) setShift(currentShift)
    if (times.length === 0) setTimes(currentTimes)
    // 仅在挂载时初始化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleShiftChange = (value: string) => {
    if (!value) return
    const next = value as '白班' | '夜班'
    setShift(next)
    // 切换班次后清空时段；切回当前班次则恢复默认时段
    setTimes(next === currentShift ? currentTimes : [])
  }

  const handleAddType = () => {
    const value = newType.trim()
    if (!value || ngTypes.includes(value)) return
    addNgType(value)
    setNewType('')
  }

  return (
    <FieldGroup>
      {/* 厂区 */}
      <Field>
        <FieldLabel>厂区</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          value={plant}
          onValueChange={(value) => value && setPlant(value as 'A' | 'B')}
          className="w-full"
        >
          <ToggleGroupItem value="A" className="flex-1">
            东区
          </ToggleGroupItem>
          <ToggleGroupItem value="B" className="flex-1">
            西区
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>

      {/* 日期 */}
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

      {/* 班次 */}
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
            白班 08:30–20:30
          </ToggleGroupItem>
          <ToggleGroupItem value="夜班" className="flex-1">
            夜班 20:30–08:30
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>

      {/* 时段 */}
      <Field>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel className="mb-0">
            <Clock3 data-icon="inline-start" />
            时段
            <span className="font-normal text-muted-foreground tabular-nums">
              {times.length}/{availableTimes.length}
            </span>
          </FieldLabel>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={times.length === 0}
              onClick={() => setTimes([])}
            >
              清空
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setTimes(availableTimes)}
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
            value={times}
            onValueChange={setTimes}
            className="grid grid-cols-4 gap-1.5"
          >
            {availableTimes.map((time) => (
              <ToggleGroupItem
                key={time}
                value={time}
                className="h-8 w-full tabular-nums"
              >
                {time} 时
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldContent>
      </Field>

      {/* 类型 */}
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
                    自定义图片类型，支持添加与删除，修改后立即生效。
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap gap-1.5">
                  {ngTypes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      暂无类型，请先添加
                    </p>
                  ) : (
                    ngTypes.map((type) => (
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
                    ))
                  )}
                </div>

                <InputGroup>
                  <InputGroupInput
                    placeholder="新增类型，如 NG_脏污_D"
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
          <FieldDescription>未选中任何类型时不会执行扫描</FieldDescription>
        </FieldContent>
      </Field>
    </FieldGroup>
  )
}

export default ImageFilterPanel
