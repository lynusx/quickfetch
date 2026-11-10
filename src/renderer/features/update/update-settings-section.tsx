import { useEffect, useState } from 'react'
import { ExclamationTriangleIcon, InfoCircledIcon } from '@radix-ui/react-icons'
import {
  Badge,
  Button,
  Callout,
  Flex,
  Progress,
  Spinner,
  Switch,
  Text,
} from '@radix-ui/themes'

import type { AppPreferences, UpdatePhase } from '@shared/ipc'
import { SettingsGroup } from '@/features/settings/components/settings-group'
import { SettingsRow } from '@/features/settings/components/settings-row'
import { useToast } from '@/hooks/useToast'
import { formatClockTime, formatFileSize } from '@/utils/common'
import {
  selectPreferences,
  useSettingsStore,
} from '@/features/settings/settingsStore'
import { useUpdateStore } from './updateStore'
import './update.css'

const PHASE_LABEL: Record<UpdatePhase, string> = {
  idle: '未检查',
  checking: '检查中',
  'up-to-date': '已是最新',
  available: '有新版本',
  downloading: '下载中',
  downloaded: '待安装',
  installing: '安装中',
  error: '失败',
  disabled: '不可用',
}

const PHASE_COLOR: Record<
  UpdatePhase,
  'green' | 'blue' | 'amber' | 'red' | 'gray'
> = {
  idle: 'gray',
  checking: 'blue',
  'up-to-date': 'green',
  available: 'green',
  downloading: 'blue',
  downloaded: 'green',
  installing: 'blue',
  error: 'red',
  disabled: 'gray',
}

const PHASE_TEXT: Record<UpdatePhase, string> = {
  idle: '尚未检查更新',
  checking: '正在检查更新…',
  'up-to-date': '已是最新版本',
  available: '发现新版本',
  downloading: '正在下载更新…',
  downloaded: '更新已下载，重启后生效',
  installing: '正在退出并安装更新…',
  error: '更新失败',
  disabled: '当前版本不支持自动更新',
}

/**
 * 设置页「更新」分区。
 *
 * 安装版提供下载与重启安装；免安装版只给下载页面入口，
 * 两种情况都不会绕过运行中任务的保护。
 */
export const UpdateSettingsSection = () => {
  const preferences = useSettingsStore(selectPreferences)
  const savePreferences = useSettingsStore((store) => store.savePreferences)
  const state = useUpdateStore((store) => store.state)
  const actionError = useUpdateStore((store) => store.actionError)
  const check = useUpdateStore((store) => store.check)
  const download = useUpdateStore((store) => store.download)
  const install = useUpdateStore((store) => store.install)
  const openReleasePage = useUpdateStore((store) => store.openReleasePage)
  const clearActionError = useUpdateStore((store) => store.clearActionError)
  const { showToast } = useToast()
  // 记录被「稍后」的版本号；新版本或阶段变化后自动失效，不需要 effect 复位
  const [postponedVersion, setPostponedVersion] = useState<string | null>(null)

  const phase: UpdatePhase = state?.phase ?? 'idle'
  const busy =
    phase === 'checking' || phase === 'downloading' || phase === 'installing'
  const installed = state?.installMode === 'installed'
  const portable = state?.installMode === 'portable'
  const postponed = postponedVersion === state?.availableVersion

  useEffect(() => {
    if (!actionError) return

    showToast('更新操作失败', actionError, 'error')
    clearActionError()
  }, [actionError, showToast, clearActionError])

  const patch = (next: Partial<AppPreferences>) => {
    void savePreferences(next)
  }

  const runCheck = async () => {
    const next = await check()

    if (next?.phase === 'error' && next.error) {
      showToast('检查更新失败', next.error, 'error')
    }
  }

  const runDownload = async () => {
    const next = await download()

    if (next?.phase === 'error' && next.error) {
      showToast('下载更新失败', next.error, 'error')
    }
  }

  const runInstall = async () => {
    const next = await install()

    if (next?.phase === 'error' && next.error) {
      showToast('安装更新失败', next.error, 'error')
    }
  }

  const runOpenPage = async () => {
    const error = await openReleasePage()

    if (error) showToast('无法打开下载页面', error, 'error')
  }

  const statusText =
    phase === 'available' && state?.availableVersion
      ? `发现新版本 v${state.availableVersion}`
      : phase === 'error' && state?.error
        ? state.error
        : phase === 'disabled' && state?.message
          ? state.message
          : PHASE_TEXT[phase]

  const showManualEntry =
    phase === 'error' ||
    (portable && (phase === 'available' || phase === 'downloaded'))

  return (
    <SettingsGroup id="update" title="更新">
      <SettingsRow
        label="当前版本"
        description={`v${state?.currentVersion ?? '…'} · ${
          installed
            ? '安装版，可自动更新'
            : portable
              ? '免安装版，需手动替换'
              : '正在识别安装方式'
        }`}
      >
        <Badge color={PHASE_COLOR[phase]} variant="soft">
          {PHASE_LABEL[phase]}
        </Badge>
      </SettingsRow>

      <SettingsRow
        label="启动时自动检查更新"
        help="启动约 10 秒后检查一次，不轮询；失败只写日志。"
      >
        <Switch
          checked={preferences.updateAutoCheckEnabled}
          aria-label="启动时自动检查更新"
          onCheckedChange={(checked) =>
            patch({ updateAutoCheckEnabled: checked })
          }
        />
      </SettingsRow>

      <div className="settings-card-footer update-state" aria-live="polite">
        <Flex align="start" justify="between" gap="3" wrap="wrap">
          <Flex align="center" gap="2" className="update-status">
            {busy ? <Spinner size="1" /> : null}
            <Text
              as="p"
              size="2"
              weight="medium"
              className="settings-row-label"
            >
              {statusText}
            </Text>
          </Flex>

          <Flex className="update-actions" gap="2" wrap="wrap">
            <Button
              variant="soft"
              color="gray"
              size="2"
              disabled={busy || phase === 'downloaded' || phase === 'disabled'}
              onClick={() => void runCheck()}
            >
              检查更新
            </Button>

            {installed && phase === 'available' ? (
              <Button size="2" onClick={() => void runDownload()}>
                下载更新
              </Button>
            ) : null}

            {installed && phase === 'downloaded' ? (
              <Button
                size="2"
                disabled={!state?.canInstall}
                onClick={() => void runInstall()}
              >
                立即重启安装
              </Button>
            ) : null}

            {showManualEntry ? (
              <Button
                variant="soft"
                color="gray"
                size="2"
                onClick={() => void runOpenPage()}
              >
                打开下载页面
              </Button>
            ) : null}
          </Flex>
        </Flex>

        {phase === 'downloading' ? (
          <>
            <Progress value={state?.percent ?? 0} />
            <Text as="p" size="1" color="gray" className="tabular">
              {state?.percent ?? 0}% · {formatFileSize(state?.transferred ?? 0)}{' '}
              / {formatFileSize(state?.total ?? 0)} ·{' '}
              {formatFileSize(state?.bytesPerSecond ?? 0)}/s
            </Text>
          </>
        ) : null}

        {state?.lastCheckedAt ? (
          <Text as="p" size="1" color="gray">
            上次检查：{formatClockTime(state.lastCheckedAt)}
          </Text>
        ) : null}

        {portable && phase === 'available' ? (
          <Callout.Root color="amber" className="update-callout">
            <Callout.Icon>
              <InfoCircledIcon width={16} height={16} />
            </Callout.Icon>
            <Callout.Text>
              当前为免安装版，无法自动安装。请下载 zip，关闭应用后覆盖原目录；
              数据保存在 %APPDATA%\QuickFetch，不会丢失。
            </Callout.Text>
          </Callout.Root>
        ) : null}

        {installed && phase === 'downloaded' && !postponed ? (
          <Callout.Root color="green" className="update-callout">
            <Callout.Icon>
              <InfoCircledIcon width={16} height={16} />
            </Callout.Icon>
            <Callout.Text>
              <Flex align="center" justify="between" gap="3" wrap="wrap">
                <Text>
                  更新 v{state?.availableVersion ?? ''} 已下载，重启后生效。
                </Text>
                <Button
                  variant="soft"
                  color="gray"
                  size="1"
                  onClick={() =>
                    setPostponedVersion(state?.availableVersion ?? null)
                  }
                >
                  稍后
                </Button>
              </Flex>
            </Callout.Text>
          </Callout.Root>
        ) : null}

        {state?.blockedByTasks && state.blockedReason ? (
          <Callout.Root color="amber" className="update-callout">
            <Callout.Icon>
              <ExclamationTriangleIcon width={16} height={16} />
            </Callout.Icon>
            <Callout.Text>{state.blockedReason}</Callout.Text>
          </Callout.Root>
        ) : null}

        {phase === 'error' && state?.error ? (
          <Callout.Root color="red" role="alert" className="update-callout">
            <Callout.Icon>
              <ExclamationTriangleIcon width={16} height={16} />
            </Callout.Icon>
            <Callout.Text>{state.error}</Callout.Text>
          </Callout.Root>
        ) : null}
      </div>
    </SettingsGroup>
  )
}
