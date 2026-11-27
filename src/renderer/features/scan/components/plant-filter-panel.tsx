import { useState } from 'react'

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
import { useSettingsStore } from '@/features/settings'
import type { ScanCategory } from '@shared/ipc'
import { PL_LEVELS } from '@shared/ipc'
import { SCAN_CATEGORY_META } from '@shared/scanCategories'

import { scanScopeOf } from '../scanScope'
import PlantMachinePicker from './plant-machine-picker'

/**
 * Scope Parameter Matrix（扫描范围参数矩阵）：四类扫描共用的单列纵向表单。
 *
 * 按 ADR-0006 固定顺序：日期/班次 → 时段（除 AOI）→ 厂区/机台（含 AOI 检测面与图片类型）
 * → 等级（仅利珀）→ 类型。所有状态转移委托给 `scanScopeOf(category)`，组件内不设副作用监听。
 */

const FilterDateShift = ({ category }: { category: ScanCategory }) => {
  const scope = scanScopeOf(category)
  const meta = SCAN_CATEGORY_META[category]
  const { date, shift, slots } = scope.useSlice((state) => ({
    date: state.date,
    shift: state.shift,
    slots: state.slots,
  }))
  const availableSlots = scope.availableSlots(shift)

  return (
    <Flex direction="column" gap="4">
      <Flex wrap="wrap" align="start" gapX="6" gapY="4">
        <Box width="220px" flexShrink="0">
          <Field label="日期" icon={<Calendar size={15} strokeWidth={1.75} />}>
            <DatePicker value={date} onChange={scope.setDate} />
          </Field>
        </Box>

        <Field label="班次">
          <Box py="1">
            <ChoiceRadio
              layout="inline"
              value={shift}
              onValueChange={(value) => {
                if (value) scope.changeShift(value as '白班' | '夜班')
              }}
              options={[
                { value: '白班', label: '白班' },
                { value: '夜班', label: '夜班' },
              ]}
            />
          </Box>
        </Field>
      </Flex>

      {meta.hasSlots ? (
        <Field
          label="时段"
          icon={<Clock size={15} strokeWidth={1.75} />}
          count={`${slots.length}/${availableSlots.length}`}
          actions={
            <BulkActions
              onToggleAll={scope.toggleAllSlots}
              allSelected={
                availableSlots.length > 0 &&
                slots.length === availableSlots.length
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
            onValueChange={scope.setSlots}
            options={availableSlots.map((slot) => ({
              value: slot,
              label: slot,
            }))}
          />
        </Field>
      ) : null}
    </Flex>
  )
}

const FilterLevels = ({ category }: { category: ScanCategory }) => {
  const scope = scanScopeOf(category)
  const levels = scope.useSlice((state) => state.levels)

  return (
    <Field
      label="等级"
      icon={<CircleCheck size={15} strokeWidth={1.75} />}
      count={`${levels.length}/${PL_LEVELS.length}`}
      actions={
        <BulkActions
          onToggleAll={scope.toggleAllLevels}
          allSelected={levels.length === PL_LEVELS.length}
          cancelLabel="清空"
          toggleIcon
        />
      }
    >
      <ChoiceList
        layout="inline"
        value={levels}
        onValueChange={scope.setLevels}
        options={PL_LEVELS.map((level) => ({ value: level, label: level }))}
      />
    </Field>
  )
}

const FilterTypes = ({ category }: { category: ScanCategory }) => {
  const scope = scanScopeOf(category)
  const meta = SCAN_CATEGORY_META[category]
  const catalog = useSettingsStore(
    (state) => state.settings?.categories[category].typeCatalog ?? [],
  )
  const addType = useSettingsStore((state) => state.addType)
  const removeType = useSettingsStore((state) => state.removeType)

  const selectedTypes = scope.useSlice((state) => state.types)
  const [newType, setNewType] = useState('')

  const handleAddType = () => {
    const value = newType.trim()
    if (!value || catalog.includes(value)) return

    void addType(category, value)
    scope.addSelectedType(value)
    setNewType('')
  }

  return (
    <Field
      label="类型"
      icon={<Layers size={15} strokeWidth={1.75} />}
      count={`${selectedTypes.length}/${catalog.length}`}
      actions={
        <BulkActions
          onToggleAll={() => scope.toggleAllTypes(catalog)}
          allSelected={
            catalog.length > 0 && selectedTypes.length === catalog.length
          }
          toggleDisabled={!catalog.length}
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
                  {catalog.length ? (
                    catalog.map((type) => (
                      <Badge key={type} color="gray" size="2">
                        <Flex align="center" gap="1">
                          <Text size="1">{type}</Text>
                          <IconButton
                            size="1"
                            variant="ghost"
                            color="gray"
                            aria-label={`删除 ${type}`}
                            onClick={() => {
                              void removeType(category, type)
                              scope.removeSelectedType(type)
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
                  placeholder={meta.typePlaceholder}
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
                        !newType.trim() || catalog.includes(newType.trim())
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
        onValueChange={scope.setTypes}
        options={catalog.map((type) => ({ value: type, label: type }))}
        empty={`还没有类型，点击「编辑」添加（如 ${meta.typeExample}）`}
      />
    </Field>
  )
}

interface PlantFilterPanelProps {
  category: ScanCategory
}

const PlantFilterPanel = ({ category }: PlantFilterPanelProps) => {
  const meta = SCAN_CATEGORY_META[category]

  return (
    <Flex direction="column" gap="4">
      <FilterDateShift category={category} />
      <PlantMachinePicker category={category} />
      {meta.requiresLevels ? <FilterLevels category={category} /> : null}
      <FilterTypes category={category} />
    </Flex>
  )
}

export default PlantFilterPanel
