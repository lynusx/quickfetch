import { Building2, Monitor, RefreshCw, Search } from 'lucide-react'
import {
  Box,
  Callout,
  Code,
  Flex,
  IconButton,
  Spinner,
  Text,
  TextField,
} from '@radix-ui/themes'

import { BulkActions } from '@/components/bulk-actions/bulk-actions'
import { ChoiceList, ChoiceRadio } from '@/components/choice-list'
import { Field } from '@/components/field'
import { useSettingsStore } from '@/features/settings'
import { useToast } from '@/hooks/useToast'
import type { AoiImageKind, AoiSide, ScanCategory } from '@shared/ipc'
import {
  AOI_IMAGE_DIRS,
  AOI_IMAGE_KIND_LABEL,
  AOI_SIDE_LABEL,
  plantLabel,
} from '@shared/ipc'
import { SCAN_CATEGORY_META } from '@shared/scanCategories'

import { scanScopeOf } from '../scanScope'
import { machinePath } from './plant-machine-model'

interface PlantMachinePickerProps {
  category: ScanCategory
}

/**
 * Plant Machine Picker（厂区与机台选择器）。
 *
 * `Entry Root` 已上提至 `Page Header Actions`，本模块专注于厂区切换、
 * AOI 检测面与图片类型切换、机台过滤与多选；默认勾选与裁剪规则统一在 `Scan Scope`。
 */
const PlantMachinePicker = ({ category }: PlantMachinePickerProps) => {
  const { showToast } = useToast()
  const scope = scanScopeOf(category)
  const meta = SCAN_CATEGORY_META[category]

  const settings = useSettingsStore((state) => state.settings)
  const saving = useSettingsStore((state) => state.saving)
  const error = useSettingsStore((state) => state.error)
  const refreshEntry = useSettingsStore((state) => state.refreshEntry)

  const { plant, keyword, selectedMachines, side, imageKind } = scope.useSlice(
    (state) => ({
      plant: state.plant,
      keyword: state.keyword,
      selectedMachines: state.selectedMachines,
      side: state.side,
      imageKind: state.imageKind,
    }),
  )

  const {
    configured,
    activeMachines,
    plants,
    visibleMachines,
    allVisibleSelected,
    sideCounts,
  } = scope.projectMachines(settings)

  const handleRefresh = async () => {
    const result = await refreshEntry(category)
    if (!result || category === 'el') return

    const parts = [`${result.added} 台新增`]
    if (result.removed) parts.push(`${result.removed} 台已从入口移除`)
    if (result.relocated) parts.push(`${result.relocated} 台位置已更新`)

    showToast('机台识别完成', parts.join('，') || '机台列表无变化', 'info')
  }

  return (
    <Flex direction="column" gap="4">
      {error ? (
        <Callout.Root color="red" size="1">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      ) : null}

      {configured && activeMachines.length > 0 ? (
        <Flex direction="column" gap="4">
          <Field
            label="厂区"
            icon={<Building2 size={15} strokeWidth={1.75} />}
            count={plant ? plantLabel(plant) : '未选择'}
          >
            <ChoiceRadio
              layout="inline"
              value={plant}
              onValueChange={(nextPlant) =>
                scope.changePlant(nextPlant, settings)
              }
              options={plants.map((item) => ({
                value: item.value,
                label: item.label,
                meta: item.count,
              }))}
            />
          </Field>

          {meta.hasSideFilter ? (
            <Field label="检测面">
              <ChoiceRadio
                layout="inline"
                value={side}
                onValueChange={(value) =>
                  scope.changeSide(value as AoiSide, settings)
                }
                options={(['all', 'front', 'back'] as AoiSide[]).map(
                  (value) => ({
                    value,
                    label: AOI_SIDE_LABEL[value],
                    meta: sideCounts[value],
                  }),
                )}
              />
            </Field>
          ) : null}

          <Field
            label="机台"
            icon={<Monitor size={15} strokeWidth={1.75} />}
            count={`${selectedMachines.length}/${visibleMachines.length}`}
            actions={
              <>
                <Box width="200px">
                  <TextField.Root
                    value={keyword}
                    placeholder={meta.searchPlaceholder}
                    spellCheck={false}
                    onChange={(event) => scope.setKeyword(event.target.value)}
                  >
                    <TextField.Slot side="left">
                      <Search size={14} strokeWidth={1.75} />
                    </TextField.Slot>
                  </TextField.Root>
                </Box>
                <BulkActions
                  onToggleAll={() => scope.toggleVisibleMachines(settings)}
                  allSelected={allVisibleSelected}
                  toggleDisabled={visibleMachines.length === 0}
                  selectLabel="全选本区"
                  cancelLabel="清空本区"
                  toggleIcon
                  extra={
                    <IconButton
                      type="button"
                      variant="soft"
                      color="gray"
                      aria-label={meta.refreshLabel}
                      disabled={saving}
                      onClick={() => void handleRefresh()}
                      title={meta.refreshLabel}
                    >
                      {saving ? (
                        <Spinner size="1" />
                      ) : (
                        <RefreshCw size={14} strokeWidth={1.75} />
                      )}
                    </IconButton>
                  }
                />
              </>
            }
          >
            {visibleMachines.length ? (
              <ChoiceList
                layout="inline"
                itemWidth="128px"
                scroll
                scrollMaxHeight="180px"
                value={selectedMachines}
                onValueChange={scope.setSelectedMachines}
                options={visibleMachines.map((machine) => {
                  const path = machinePath(machine)

                  return {
                    value: machine.key,
                    label: (
                      <Code
                        variant="ghost"
                        color="gray"
                        highContrast
                        size="2"
                        truncate
                      >
                        {machine.name}
                      </Code>
                    ),
                    tooltip: path || undefined,
                  }
                })}
              />
            ) : (
              <Text size="2" color="gray">
                {keyword.trim()
                  ? `没有匹配「${keyword}」的机台`
                  : meta.hasSideFilter && side !== 'all'
                    ? '当前检测面下没有机台'
                    : '没有可用机台'}
              </Text>
            )}
          </Field>

          {meta.hasImageKind ? (
            <Field label="图片类型">
              <ChoiceRadio
                layout="inline"
                value={imageKind}
                onValueChange={(value) =>
                  scope.setImageKind(value as AoiImageKind)
                }
                options={(['whole', 'partial'] as AoiImageKind[]).map(
                  (value) => ({
                    value,
                    label: AOI_IMAGE_KIND_LABEL[value],
                    tooltip: AOI_IMAGE_DIRS[value],
                  }),
                )}
              />
            </Field>
          ) : null}
        </Flex>
      ) : (
        <Text size="2" color="gray">
          {configured ? meta.emptyMachinesText : meta.unconfiguredText}
        </Text>
      )}
    </Flex>
  )
}

export default PlantMachinePicker
