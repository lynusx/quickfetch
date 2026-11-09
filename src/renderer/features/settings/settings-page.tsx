import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ExclamationTriangleIcon } from '@radix-ui/react-icons'
import {
  Box,
  Button,
  Callout,
  Code,
  Flex,
  RadioCards,
  Slider,
  Switch,
  Text,
} from '@radix-ui/themes'

import { PageHeader } from '@/components/page-header/page-header'
import { SettingsGroup } from './components/settings-group'
import { SettingsRow } from './components/settings-row'
import { useToast } from '@/hooks/useToast'
import { UpdateSettingsSection } from '@/features/update'
import { toErrorMessage } from '@/utils/error'
import {
  selectEnvOverrides,
  selectPreferences,
  useSettingsStore,
} from './settingsStore'
import type {
  AppPreferences,
  CopyConflictPolicy,
  CopyLayout,
  LogInfo,
  PreferenceKey,
} from '@shared/ipc'
import {
  COPY_CONFLICT_LABEL,
  COPY_LAYOUT_LABEL,
  DEFAULT_PREFERENCES,
  PREFERENCE_ENV,
  PREFERENCE_RANGE,
} from '@shared/ipc'
import {
  DEFAULT_HISTORY_LIMIT,
  HISTORY_LIMIT_RANGE,
} from '@shared/historyLimit'
import './settings.css'

/** 分组方式的实际目录形态，光看名字不知道会建几层 */
const LAYOUT_SAMPLE: Record<CopyLayout, string> = {
  flat: '目标目录/img.jpg',
  machine: '目标目录/A01-A/img.jpg',
  type: '目标目录/NG_脏污_B/img.jpg',
  'machine-type': '目标目录/A01-A/NG_脏污_B/img.jpg',
}

const CONFLICT_HINT: Record<CopyConflictPolicy, string> = {
  rename: '目标占用的名字自动编号，一张不少',
  skip: '只有同名的那一张跳过，其余照常复制',
  overwrite: '顶掉目标文件，无法撤销',
}

const LAYOUTS: CopyLayout[] = ['flat', 'machine', 'type', 'machine-type']
const CONFLICTS: CopyConflictPolicy[] = ['rename', 'skip', 'overwrite']

interface SliderRowProps {
  label: string
  hint: string
  unit: string
  value: number
  range: { min: number; max: number; step: number }
  /** 被环境变量接管时禁用滑杆并说明原因，不然用户会以为没保存上 */
  envName?: string
  onChange: (next: number) => void
}

/**
 * 数值设置：拖动时只更新本地显示，松手或键盘操作结束才落盘。
 *
 * 边拖边写盘会把一次拖动拆成几十次 IPC，主进程要跟着改几十遍配置；
 * 本地 draft 负责跟手，onValueCommit 只提交最终值。
 */
const SliderRow = ({
  label,
  hint,
  unit,
  value,
  range,
  envName,
  onChange,
}: SliderRowProps) => {
  const [draft, setDraft] = useState(value)
  const [syncedValue, setSyncedValue] = useState(value)
  const overridden = Boolean(envName)

  // 落盘后 value 会回写；在渲染期条件同步，避免 effect 里 setState 的级联渲染
  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(value)
  }

  const commit = (next: number) => {
    const clamped = Math.min(range.max, Math.max(range.min, next))
    setDraft(clamped)

    if (clamped !== value) onChange(clamped)
  }

  return (
    <div className="settings-row settings-row-slider">
      <div className="settings-row-main">
        <Text as="p" size="2" weight="medium" className="settings-row-label">
          {label}
        </Text>
        <Text as="p" size="1" color="gray" className="settings-row-hint">
          {overridden ? (
            <>
              已由环境变量 <Code size="1">{envName}</Code> 接管，此处不生效
            </>
          ) : (
            hint
          )}
        </Text>
      </div>

      <Flex
        className="settings-row-slider-control"
        align="center"
        gap="2"
        role="group"
        aria-label={label}
      >
        <Text
          as="span"
          size="1"
          color="gray"
          className="settings-row-slider-bound"
        >
          {range.min}
        </Text>
        <Box className="settings-row-slider-track">
          <Slider
            value={[draft]}
            min={range.min}
            max={range.max}
            step={range.step}
            disabled={overridden}
            aria-label={label}
            onValueChange={(values) => {
              const next = values[0]

              if (next !== undefined) setDraft(next)
            }}
            onValueCommit={(values) => {
              const next = values[0]

              if (next !== undefined) commit(next)
            }}
          />
        </Box>
        <Text
          as="span"
          size="1"
          color="gray"
          className="settings-row-slider-bound"
        >
          {range.max}
        </Text>
      </Flex>

      <Text as="span" size="2" weight="medium" className="settings-row-value">
        {draft} {unit}
      </Text>
    </div>
  )
}

const SettingsPage = () => {
  const preferences = useSettingsStore(selectPreferences)
  const envOverrides = useSettingsStore(selectEnvOverrides)
  const error = useSettingsStore((state) => state.error)
  const save = useSettingsStore((state) => state.savePreferences)
  const historyLimit = useSettingsStore(
    (state) => state.settings?.historyLimit ?? DEFAULT_HISTORY_LIMIT,
  )
  const saveHistoryLimit = useSettingsStore((state) => state.saveHistoryLimit)
  const load = useSettingsStore((state) => state.load)
  const { showToast } = useToast()
  const [logInfo, setLogInfo] = useState<LogInfo | null>(null)
  const [logInfoFailed, setLogInfoFailed] = useState(false)
  const [searchParams] = useSearchParams()
  const updateRequested = searchParams.get('section') === 'update'

  // 直接深链到 #/settings 时 store 可能还没读盘，先补一次
  useEffect(() => {
    void load()
  }, [load])

  // 侧边栏的「有新版本」跳到 ?section=update，滚动到对应分区
  useEffect(() => {
    if (!updateRequested) return

    document.getElementById('update')?.scrollIntoView({ block: 'start' })
  }, [updateRequested])

  useEffect(() => {
    let cancelled = false

    window.electronAPI
      .getLogInfo()
      .then((info) => {
        if (!cancelled) setLogInfo(info)
      })
      .catch(() => {
        if (!cancelled) setLogInfoFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const patch = (next: Partial<AppPreferences>) => {
    void save(next)
  }

  const openLogDir = async () => {
    try {
      const error = await window.electronAPI.openLogDir()

      if (error) showToast('无法打开日志目录', error, 'error')
    } catch (error) {
      showToast(
        '无法打开日志目录',
        toErrorMessage(error, '请稍后重试'),
        'error',
      )
    }
  }

  /** 只恢复复制策略与并发档位，不把正在排查的调试日志关掉 */
  const restoreCopyDefaults = () => {
    patch({
      copyLayout: DEFAULT_PREFERENCES.copyLayout,
      copyConflict: DEFAULT_PREFERENCES.copyConflict,
      scanConcurrency: DEFAULT_PREFERENCES.scanConcurrency,
      scanBatchSize: DEFAULT_PREFERENCES.scanBatchSize,
      copyConcurrency: DEFAULT_PREFERENCES.copyConcurrency,
      copyBatchSize: DEFAULT_PREFERENCES.copyBatchSize,
    })
  }

  /** 被接管时把环境变量名传下去，行内会换成说明文案 */
  const envName = (key: PreferenceKey) =>
    envOverrides.includes(key) ? PREFERENCE_ENV[key] : undefined

  return (
    <Box className="settings-page">
      <Box className="settings-page-inner">
        <PageHeader eyebrow="应用" title="设置" />

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

          <SettingsGroup id="copy" title="复制到本地">
            <SettingsRow label="分组方式" hint="目标目录下建几层文件夹" stacked>
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
            </SettingsRow>

            <SettingsRow
              label="重名文件"
              hint="目标里已有同名文件时（覆盖无法撤销，会二次确认）"
              stacked
            >
              <RadioCards.Root
                columns={{ initial: '1', sm: '3' }}
                value={preferences.copyConflict}
                onValueChange={(value) =>
                  value && patch({ copyConflict: value as CopyConflictPolicy })
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
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup id="history" title="历史记录">
            <SliderRow
              label="保留条数"
              hint="超出后自动删除最旧的记录"
              unit="条"
              value={historyLimit}
              range={HISTORY_LIMIT_RANGE}
              onChange={(next) => void saveHistoryLimit(next)}
            />
          </SettingsGroup>

          <SettingsGroup id="performance" title="性能">
            <SliderRow
              label="同时读取目录"
              hint="失败率过高会自动降档"
              unit="个"
              value={preferences.scanConcurrency}
              range={PREFERENCE_RANGE.scanConcurrency}
              envName={envName('scanConcurrency')}
              onChange={(next) => patch({ scanConcurrency: next })}
            />
            <SliderRow
              label="每批扫描机台"
              hint="一批跑完再开下一批"
              unit="台"
              value={preferences.scanBatchSize}
              range={PREFERENCE_RANGE.scanBatchSize}
              envName={envName('scanBatchSize')}
              onChange={(next) => patch({ scanBatchSize: next })}
            />
            <SliderRow
              label="同时复制文件"
              hint="共享盘冲突时调低"
              unit="个"
              value={preferences.copyConcurrency}
              range={PREFERENCE_RANGE.copyConcurrency}
              envName={envName('copyConcurrency')}
              onChange={(next) => patch({ copyConcurrency: next })}
            />
            <SliderRow
              label="每批复制文件"
              hint="批与批之间让出一次界面刷新"
              unit="张"
              value={preferences.copyBatchSize}
              range={PREFERENCE_RANGE.copyBatchSize}
              envName={envName('copyBatchSize')}
              onChange={(next) => patch({ copyBatchSize: next })}
            />
          </SettingsGroup>

          <UpdateSettingsSection />

          <SettingsGroup id="logging" title="调试日志">
            <SettingsRow
              label="启用调试日志"
              hint="默认关闭；开启后立即生效"
              tooltip="日志按天写入 userData/logs，保留最近 7 天。"
            >
              <Switch
                checked={preferences.debugLogEnabled}
                aria-label="启用调试日志"
                onCheckedChange={(checked) =>
                  patch({ debugLogEnabled: checked })
                }
              />
            </SettingsRow>

            <SettingsRow
              label="日志目录"
              hint={
                logInfo ? (
                  <Code size="1">{logInfo.dir}</Code>
                ) : logInfoFailed ? (
                  '读取日志目录失败'
                ) : (
                  '读取中…'
                )
              }
              className="settings-row-log"
            >
              <Button
                variant="soft"
                color="gray"
                size="2"
                onClick={() => void openLogDir()}
              >
                打开日志目录
              </Button>
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup id="other" title="其他">
            <SettingsRow
              label="恢复默认设置"
              hint="复制策略与所有并发档位回到出厂值"
              tooltip="扫描历史与调试日志不受影响。"
            >
              <Button
                variant="soft"
                color="gray"
                size="2"
                onClick={restoreCopyDefaults}
              >
                恢复默认
              </Button>
            </SettingsRow>
          </SettingsGroup>

          <Text as="p" size="1" color="gray" className="settings-footnote">
            设置保存在 <Code size="1">%APPDATA%\QuickFetch\settings.json</Code>
            ，换台电脑需要重新设置。
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

export default SettingsPage
