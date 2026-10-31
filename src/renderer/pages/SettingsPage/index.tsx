import { useEffect, useState } from 'react'
import { CircleAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  selectEnvOverrides,
  selectPreferences,
  useSettingsStore,
} from '@/stores/settingsStore'
import type {
  AppPreferences,
  CopyConflictPolicy,
  CopyLayout,
  PreferenceKey,
} from '../../../shared/ipc'
import {
  COPY_CONFLICT_LABEL,
  COPY_LAYOUT_LABEL,
  DEFAULT_PREFERENCES,
  PREFERENCE_ENV,
  PREFERENCE_RANGE,
} from '../../../shared/ipc'
import { cn } from '@/lib/utils'

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

/** 选项卡片：选中态只靠边框和底色，不用额外的勾选图标 */
const OptionCard = ({
  active,
  danger,
  title,
  hint,
  onClick,
}: {
  active: boolean
  danger?: boolean
  title: string
  hint: string
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors',
      active
        ? danger
          ? 'border-destructive bg-destructive/5'
          : 'border-primary bg-primary/5'
        : 'hover:bg-muted/60',
    )}
  >
    <span className="text-sm font-medium">{title}</span>
    <span className="truncate font-mono text-[11px] text-muted-foreground">
      {hint}
    </span>
  </button>
)

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
  const overridden = Boolean(envName)

  useEffect(() => {
    setDraft(String(value))
  }, [value])

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
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">
          {overridden ? (
            <>
              已由环境变量{' '}
              <code className="rounded bg-muted px-1 font-mono text-[11px]">
                {envName}
              </code>{' '}
              接管，此处不生效
            </>
          ) : (
            hint
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
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
          className="h-8 w-16 text-right tabular-nums"
        />
        <span className="w-4 text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
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
    <div className="flex max-w-3xl flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>保存失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">复制到本地</h2>

        <Card>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm">分组方式</span>
              <span className="text-xs text-muted-foreground">
                目标目录下建几层文件夹
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {LAYOUTS.map((value) => (
                <OptionCard
                  key={value}
                  active={preferences.copyLayout === value}
                  title={COPY_LAYOUT_LABEL[value]}
                  hint={LAYOUT_SAMPLE[value]}
                  onClick={() => patch({ copyLayout: value })}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm">重名文件</span>
              <span className="text-xs text-muted-foreground">
                目标里已有同名文件时
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {CONFLICTS.map((value) => (
                <OptionCard
                  key={value}
                  active={preferences.copyConflict === value}
                  danger={value === 'overwrite'}
                  title={COPY_CONFLICT_LABEL[value]}
                  hint={CONFLICT_HINT[value]}
                  onClick={() => patch({ copyConflict: value })}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">性能</h2>

        <Card>
          <CardContent className="flex flex-col divide-y">
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
              hint={`${PREFERENCE_RANGE.copyConcurrency.min}–${PREFERENCE_RANGE.copyConcurrency.max}，网络盘共享冲突时调低`}
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
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          数值越大越快，网络盘不稳时反而更容易超时。设置只影响之后新建的任务。
        </p>
      </section>

      <Separator />

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          设置保存在本机，换台电脑需要重新设置。
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => patch({ ...DEFAULT_PREFERENCES })}
        >
          恢复默认
        </Button>
      </div>
    </div>
  )
}

export default SettingsPage
