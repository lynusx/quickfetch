import { useState } from 'react'
import { ExclamationTriangleIcon } from '@radix-ui/react-icons'
import {
  Box,
  Button,
  Callout,
  Card,
  Code,
  Flex,
  Heading,
  RadioCards,
  Separator,
  Text,
  TextField,
} from '@radix-ui/themes'

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
    <Flex align="center" justify="between" gap="4" py="3">
      <Box style={{ minWidth: 0, flex: 1 }}>
        <Text size="2" weight="medium" as="p">
          {label}
        </Text>
        <Text size="1" color="gray" as="p" mt="1">
          {overridden ? (
            <>
              已由环境变量 <Code size="1">{envName}</Code> 接管，此处不生效
            </>
          ) : (
            <>
              {hint}
              <Text size="1" color="gray" ml="2" style={{ opacity: 0.75 }}>
                [范围: {range.min} ~ {range.max}]
              </Text>
            </>
          )}
        </Text>
      </Box>
      <Flex align="center" gap="2" style={{ flexShrink: 0 }}>
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
          style={{
            width: 90,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <TextField.Slot side="right">
            <Text size="1" color="gray">
              {unit}
            </Text>
          </TextField.Slot>
        </TextField.Root>
      </Flex>
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

  return (
    <Flex direction="column" gap="5" style={{ maxWidth: 760 }}>
      {error && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <ExclamationTriangleIcon width={16} height={16} />
          </Callout.Icon>
          <Callout.Text>
            <Text weight="medium">保存失败</Text>: {error}
          </Callout.Text>
        </Callout.Root>
      )}

      {/* 复制到本地 */}
      <Flex direction="column" gap="3">
        <Heading size="3">复制到本地</Heading>

        <Card size="2">
          <Flex direction="column" gap="1" mb="3">
            <Heading size="2">分组方式</Heading>
            <Text size="1" color="gray">
              目标目录下建几层文件夹
            </Text>
          </Flex>

          <RadioCards.Root
            columns={{ initial: '1', sm: '2' }}
            value={preferences.copyLayout}
            onValueChange={(value) =>
              value && patch({ copyLayout: value as CopyLayout })
            }
          >
            {LAYOUTS.map((value) => (
              <RadioCards.Item key={value} value={value}>
                <Flex direction="column" gap="1" style={{ width: '100%' }}>
                  <Text size="2" weight="medium">
                    {COPY_LAYOUT_LABEL[value]}
                  </Text>
                  <Text
                    size="1"
                    color="gray"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {LAYOUT_SAMPLE[value]}
                  </Text>
                </Flex>
              </RadioCards.Item>
            ))}
          </RadioCards.Root>
        </Card>

        <Card size="2">
          <Flex direction="column" gap="1" mb="3">
            <Heading size="2">重名文件</Heading>
            <Text size="1" color="gray">
              目标里已有同名文件时
            </Text>
          </Flex>

          <RadioCards.Root
            columns={{ initial: '1', sm: '3' }}
            value={preferences.copyConflict}
            onValueChange={(value) =>
              value && patch({ copyConflict: value as CopyConflictPolicy })
            }
          >
            {CONFLICTS.map((value) => (
              <RadioCards.Item key={value} value={value}>
                <Flex direction="column" gap="1" style={{ width: '100%' }}>
                  <Text
                    size="2"
                    weight="medium"
                    color={value === 'overwrite' ? 'red' : undefined}
                  >
                    {COPY_CONFLICT_LABEL[value]}
                  </Text>
                  <Text
                    size="1"
                    color="gray"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {CONFLICT_HINT[value]}
                  </Text>
                </Flex>
              </RadioCards.Item>
            ))}
          </RadioCards.Root>
        </Card>
      </Flex>

      {/* 性能 */}
      <Flex direction="column" gap="3">
        <Heading size="3">性能</Heading>

        <Card size="2">
          <Flex direction="column">
            <NumberRow
              label="同时读取目录"
              hint={`${PREFERENCE_RANGE.scanConcurrency.min}–${PREFERENCE_RANGE.scanConcurrency.max}，失败率过高会自动降档`}
              unit="个"
              value={preferences.scanConcurrency}
              range={PREFERENCE_RANGE.scanConcurrency}
              envName={envName('scanConcurrency')}
              onChange={(next) => patch({ scanConcurrency: next })}
            />
            <Separator size="4" />
            <NumberRow
              label="每批扫描机台"
              hint="一批跑完再开下一批"
              unit="台"
              value={preferences.scanBatchSize}
              range={PREFERENCE_RANGE.scanBatchSize}
              envName={envName('scanBatchSize')}
              onChange={(next) => patch({ scanBatchSize: next })}
            />
            <Separator size="4" />
            <NumberRow
              label="同时复制文件"
              hint={`${PREFERENCE_RANGE.copyConcurrency.min}–${PREFERENCE_RANGE.copyConcurrency.max}，网络盘共享冲突时调低`}
              unit="个"
              value={preferences.copyConcurrency}
              range={PREFERENCE_RANGE.copyConcurrency}
              envName={envName('copyConcurrency')}
              onChange={(next) => patch({ copyConcurrency: next })}
            />
            <Separator size="4" />
            <NumberRow
              label="每批复制文件"
              hint="批与批之间让出一次界面刷新"
              unit="张"
              value={preferences.copyBatchSize}
              range={PREFERENCE_RANGE.copyBatchSize}
              envName={envName('copyBatchSize')}
              onChange={(next) => patch({ copyBatchSize: next })}
            />
          </Flex>
        </Card>

        <Text size="1" color="gray">
          数值越大越快，网络盘不稳时反而更容易超时。设置只影响之后新建的任务。
        </Text>
      </Flex>

      <Separator size="4" />

      <Flex justify="between" align="center" gap="4">
        <Text size="1" color="gray">
          设置保存在本机，换台电脑需要重新设置。
        </Text>
        <Button
          variant="soft"
          color="gray"
          size="2"
          onClick={() => patch({ ...DEFAULT_PREFERENCES })}
        >
          恢复默认
        </Button>
      </Flex>
    </Flex>
  )
}

export default SettingsPage
