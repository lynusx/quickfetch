import { useState } from 'react'
import { ExclamationTriangleIcon } from '@radix-ui/react-icons'
import {
  Box,
  Button,
  Callout,
  Code,
  Flex,
  Grid,
  Heading,
  RadioCards,
  Text,
  TextField,
} from '@radix-ui/themes'

import { PageHeader } from '@/components/PageHeader'
import { Panel, PanelBody } from '@/components/Panel'
import {
  selectEnvOverrides,
  selectPreferences,
  useSettingsStore,
} from './settingsStore'
import type {
  AppPreferences,
  CopyConflictPolicy,
  CopyLayout,
  PreferenceKey,
} from '@shared/ipc'
import {
  COPY_CONFLICT_LABEL,
  COPY_LAYOUT_LABEL,
  DEFAULT_PREFERENCES,
  PREFERENCE_ENV,
  PREFERENCE_RANGE,
} from '@shared/ipc'

/** 分组方式的实际目录形态，光看名字不知道会建几层 */
const LAYOUT_SAMPLE: Record<CopyLayout, string> = {
  flat: '目标目录/img.jpg',
  machine: '目标目录/A01-A/img.jpg',
  type: '目标目录/NG_脏污_B/img.jpg',
  'machine-type': '目标目录/A01-A/NG_脏污_B/img.jpg',
}

const CONFLICT_HINT: Record<CopyConflictPolicy, string> = {
  rename: '目标占用的名字自动编号，一张不少',
  skip: '有同名就整组不复制',
  overwrite: '顶掉目标文件，无法撤销',
}

const LAYOUTS: CopyLayout[] = ['flat', 'machine', 'type', 'machine-type']
const CONFLICTS: CopyConflictPolicy[] = ['rename', 'skip', 'overwrite']

const SECTIONS = [
  { id: 'copy', label: '复制到本地' },
  { id: 'performance', label: '性能' },
  { id: 'other', label: '其他' },
]

interface NumberRowProps {
  label: string
  hint: string
  unit: string
  value: number
  range: { min: number; max: number; step: number }
  /** 被环境变量接管时禁用输入并说明原因，不然用户会以为没保存上 */
  envName?: string
  onChange: (next: number) => void
}

/**
 * 数值设置：输入框失焦或回车才落盘。
 *
 * 边输入边写盘会把 40 写成 4 再写成 40，主进程要跑两趟；
 * 而且用户删空输入框时不该立刻变成下限值。
 */
const NumberRow = ({
  label,
  hint,
  unit,
  value,
  range,
  envName,
  onChange,
}: NumberRowProps) => {
  const [draft, setDraft] = useState(String(value))
  const [syncedValue, setSyncedValue] = useState(value)
  const overridden = Boolean(envName)

  // 落盘后 value 会回写；在渲染期条件同步，避免 effect 里 setState 的级联渲染
  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(String(value))
  }

  const commit = () => {
    const parsed = Number.parseInt(draft, 10)

    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }

    const next = Math.min(range.max, Math.max(range.min, parsed))
    setDraft(String(next))

    if (next !== value) onChange(next)
  }

  return (
    <Flex className="setting-row" align="center" justify="between" gap="5">
      <Box className="setting-row-main">
        <Text as="p" size="2" weight="medium" className="setting-row-label">
          {label}
        </Text>
        <Text as="p" size="1" color="gray" className="setting-row-hint">
          {overridden ? (
            <>
              已由环境变量 <Code size="1">{envName}</Code> 接管，此处不生效
            </>
          ) : (
            <>
              {hint}
              <Text size="1" color="gray" ml="2">
                [范围: {range.min} ~ {range.max}]
              </Text>
            </>
          )}
        </Text>
      </Box>
      <TextField.Root
        size="2"
        type="number"
        min={range.min}
        max={range.max}
        step={range.step}
        value={draft}
        disabled={overridden}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="setting-number-input"
      >
        <TextField.Slot side="right">
          <Text size="1" color="gray">
            {unit}
          </Text>
        </TextField.Slot>
      </TextField.Root>
    </Flex>
  )
}

const SettingsPage = () => {
  const preferences = useSettingsStore(selectPreferences)
  const envOverrides = useSettingsStore(selectEnvOverrides)
  const error = useSettingsStore((state) => state.error)
  const save = useSettingsStore((state) => state.savePreferences)

  const patch = (next: Partial<AppPreferences>) => {
    void save(next)
  }

  /** 被接管时把环境变量名传下去，行内会换成说明文案 */
  const envName = (key: PreferenceKey) =>
    envOverrides.includes(key) ? PREFERENCE_ENV[key] : undefined

  const jumpTo = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <Box>
      <PageHeader
        eyebrow="应用"
        title="设置"
        description="复制策略与扫描、复制的并发档位。设置只影响之后新建的任务，保存在本机。"
      />

      <Grid className="settings-layout">
        <Flex
          className="settings-nav"
          direction="column"
          gap="1"
          role="navigation"
          aria-label="设置分组"
        >
          {SECTIONS.map((section) => (
            <Button
              key={section.id}
              type="button"
              variant="ghost"
              color="gray"
              size="1"
              className="settings-nav-item"
              onClick={() => jumpTo(section.id)}
            >
              {section.label}
            </Button>
          ))}
        </Flex>

        <Box className="settings-content">
          {error ? (
            <Callout.Root color="red" role="alert" mb="4">
              <Callout.Icon>
                <ExclamationTriangleIcon width={16} height={16} />
              </Callout.Icon>
              <Callout.Text>
                <Text weight="medium">保存失败</Text>：{error}
              </Callout.Text>
            </Callout.Root>
          ) : null}

          {/* 复制到本地 */}
          <Box id="copy" className="settings-section">
            <Box className="settings-section-head">
              <Heading as="h2" size="3" className="settings-section-title">
                复制到本地
              </Heading>
              <Text
                as="p"
                size="1"
                color="gray"
                className="settings-section-desc"
              >
                决定目标目录下建几层文件夹，以及遇到同名文件时怎么处理。
              </Text>
            </Box>

            <Flex direction="column" gap="4">
              <Panel>
                <PanelBody>
                  <Box className="setting-row-main" mb="3">
                    <Text
                      as="p"
                      size="2"
                      weight="medium"
                      className="setting-row-label"
                    >
                      分组方式
                    </Text>
                    <Text
                      as="p"
                      size="1"
                      color="gray"
                      className="setting-row-hint"
                    >
                      目标目录下建几层文件夹
                    </Text>
                  </Box>

                  <RadioCards.Root
                    columns={{ initial: '1', sm: '2' }}
                    value={preferences.copyLayout}
                    onValueChange={(value) =>
                      value && patch({ copyLayout: value as CopyLayout })
                    }
                  >
                    {LAYOUTS.map((value) => (
                      <RadioCards.Item key={value} value={value}>
                        <Flex
                          direction="column"
                          gap="1"
                          className="setting-option-card"
                        >
                          <Text
                            as="span"
                            size="2"
                            weight="medium"
                            className="setting-option-title"
                          >
                            {COPY_LAYOUT_LABEL[value]}
                          </Text>
                          <Text
                            as="span"
                            size="1"
                            color="gray"
                            className="setting-option-sample"
                          >
                            {LAYOUT_SAMPLE[value]}
                          </Text>
                        </Flex>
                      </RadioCards.Item>
                    ))}
                  </RadioCards.Root>
                </PanelBody>
              </Panel>

              <Panel>
                <PanelBody>
                  <Box className="setting-row-main" mb="3">
                    <Text
                      as="p"
                      size="2"
                      weight="medium"
                      className="setting-row-label"
                    >
                      重名文件
                    </Text>
                    <Text
                      as="p"
                      size="1"
                      color="gray"
                      className="setting-row-hint"
                    >
                      目标里已有同名文件时（覆盖无法撤销，会二次确认）
                    </Text>
                  </Box>

                  <RadioCards.Root
                    columns={{ initial: '1', sm: '3' }}
                    value={preferences.copyConflict}
                    onValueChange={(value) =>
                      value &&
                      patch({ copyConflict: value as CopyConflictPolicy })
                    }
                  >
                    {CONFLICTS.map((value) => (
                      <RadioCards.Item key={value} value={value}>
                        <Flex
                          direction="column"
                          gap="1"
                          className="setting-option-card"
                        >
                          <Text
                            as="span"
                            size="2"
                            weight="medium"
                            color={value === 'overwrite' ? 'red' : undefined}
                            className="setting-option-title"
                          >
                            {COPY_CONFLICT_LABEL[value]}
                          </Text>
                          <Text
                            as="span"
                            size="1"
                            color="gray"
                            className="setting-option-sample"
                          >
                            {CONFLICT_HINT[value]}
                          </Text>
                        </Flex>
                      </RadioCards.Item>
                    ))}
                  </RadioCards.Root>
                </PanelBody>
              </Panel>
            </Flex>
          </Box>

          {/* 性能 */}
          <Box id="performance" className="settings-section">
            <Box className="settings-section-head">
              <Heading as="h2" size="3" className="settings-section-title">
                性能
              </Heading>
              <Text
                as="p"
                size="1"
                color="gray"
                className="settings-section-desc"
              >
                数值越大越快，网络盘不稳时反而更容易超时。失败率过高时扫描会自动降档。
              </Text>
            </Box>

            <Panel>
              <PanelBody>
                <NumberRow
                  label="同时读取目录"
                  hint={`${PREFERENCE_RANGE.scanConcurrency.min}–${PREFERENCE_RANGE.scanConcurrency.max}，失败率过高会自动降档`}
                  unit="个"
                  value={preferences.scanConcurrency}
                  range={PREFERENCE_RANGE.scanConcurrency}
                  envName={envName('scanConcurrency')}
                  onChange={(next) => patch({ scanConcurrency: next })}
                />
                <NumberRow
                  label="每批扫描机台"
                  hint="一批跑完再开下一批"
                  unit="台"
                  value={preferences.scanBatchSize}
                  range={PREFERENCE_RANGE.scanBatchSize}
                  envName={envName('scanBatchSize')}
                  onChange={(next) => patch({ scanBatchSize: next })}
                />
                <NumberRow
                  label="同时复制文件"
                  hint={`${PREFERENCE_RANGE.copyConcurrency.min}–${PREFERENCE_RANGE.copyConcurrency.max}，共享盘冲突时调低`}
                  unit="个"
                  value={preferences.copyConcurrency}
                  range={PREFERENCE_RANGE.copyConcurrency}
                  envName={envName('copyConcurrency')}
                  onChange={(next) => patch({ copyConcurrency: next })}
                />
                <NumberRow
                  label="每批复制文件"
                  hint="批与批之间让出一次界面刷新"
                  unit="张"
                  value={preferences.copyBatchSize}
                  range={PREFERENCE_RANGE.copyBatchSize}
                  envName={envName('copyBatchSize')}
                  onChange={(next) => patch({ copyBatchSize: next })}
                />
              </PanelBody>
            </Panel>
          </Box>

          {/* 其他 */}
          <Box id="other" className="settings-section">
            <Box className="settings-section-head">
              <Heading as="h2" size="3" className="settings-section-title">
                其他
              </Heading>
              <Text
                as="p"
                size="1"
                color="gray"
                className="settings-section-desc"
              >
                设置保存在
                <Code size="1" mx="1">
                  %APPDATA%\shx-tools\settings.json
                </Code>
                ，换台电脑需要重新设置。
              </Text>
            </Box>

            <Panel>
              <PanelBody>
                <Flex
                  className="setting-row"
                  align="center"
                  justify="between"
                  gap="5"
                >
                  <Box className="setting-row-main">
                    <Text
                      as="p"
                      size="2"
                      weight="medium"
                      className="setting-row-label"
                    >
                      恢复默认设置
                    </Text>
                    <Text
                      as="p"
                      size="1"
                      color="gray"
                      className="setting-row-hint"
                    >
                      复制策略与所有并发档位回到出厂值，扫描历史不受影响。
                    </Text>
                  </Box>
                  <Button
                    variant="soft"
                    color="gray"
                    size="2"
                    onClick={() => patch({ ...DEFAULT_PREFERENCES })}
                  >
                    恢复默认
                  </Button>
                </Flex>
              </PanelBody>
            </Panel>
          </Box>
        </Box>
      </Grid>
    </Box>
  )
}

export default SettingsPage
