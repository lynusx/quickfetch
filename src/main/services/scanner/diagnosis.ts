import type { ScanBranch } from '../../../shared/ipc'
import { AUTH_HINT, NETWORK_HINT } from '../../../shared/networkHint'

import type { DirReadResult, DirReadStatus } from './fsx'

/**
 * 目录读取失败的统一诊断。
 *
 * 之前同一套阶梯在 EL resolver、lxtFailure、plFailure、task.markBroken
 * 各写一遍，错误码、断网样本、人话文案很容易分叉。这里只拥有三件事：
 * 1. DirReadStatus → network / auth / denied 的分类
 * 2. 分类 → 给人看的文案
 * 3. 这次读取是否计入断网熔断的样本
 *
 * NETWORK_CODES 仍只在 fsx.ts，那里才是错误码的唯一来源。
 */

export type ReadFailureReason = 'network' | 'auth' | 'denied'

export interface ReadFailureClass {
  reason?: ReadFailureReason
  /** 是否计入断网熔断；只有真正的 network 失败才算 */
  networkSample: boolean
}

const NETWORK: ReadFailureClass = { reason: 'network', networkSample: true }
const AUTH: ReadFailureClass = { reason: 'auth', networkSample: false }
const DENIED: ReadFailureClass = { reason: 'denied', networkSample: false }
const NOT_A_FAILURE: ReadFailureClass = { networkSample: false }

export const classifyReadStatus = (status: DirReadStatus): ReadFailureClass => {
  if (status === 'unreachable') return NETWORK
  if (status === 'unreadable') return AUTH
  if (status === 'denied') return DENIED

  return NOT_A_FAILURE
}

/**
 * 一组候选读取的失败分类，按「越靠近主机越优先」排序：
 * 网络 → 未认证 → 无权限。LXT/PL 的共享名探测共用这套优先级。
 */
export const classifyFailureStatuses = (
  statuses: DirReadStatus[],
): ReadFailureClass => {
  if (statuses.includes('unreachable')) return NETWORK
  if (statuses.includes('unreadable')) return AUTH
  if (statuses.includes('denied')) return DENIED

  return NOT_A_FAILURE
}

interface NetworkMessageOptions {
  quote?: boolean
  /** 任务逐目录读取时带上原始错误码；前缀探测通常不带 */
  code?: string
  codeFallback?: string
  suffix?: string
}

export const networkFailureMessage = (
  subject: string,
  options: NetworkMessageOptions = {},
): string => {
  const head = options.quote ? `「${subject}」` : subject
  const connector = options.quote ? '' : ' '
  const code = options.code || options.codeFallback

  return `${head}${connector}不可达${
    code ? `（${code}）` : ''
  }，${NETWORK_HINT}${options.suffix ?? ''}`
}

interface AuthMessageOptions {
  quote?: boolean
  /** 前缀探测里 LXT/PL 的共享根读不通，与 EL 的目录读取失败是两种说法 */
  style?: 'read-failed' | 'share-unreadable'
  suffix?: string
}

export const authFailureMessage = (
  subject: string,
  options: AuthMessageOptions = {},
): string => {
  const head = options.quote ? `「${subject}」` : subject
  const suffix = options.suffix ?? ''

  if (options.style === 'share-unreadable') {
    return `${head} 的共享读不通，多半是未认证：${AUTH_HINT}${suffix}`
  }

  const connector = options.quote ? '' : ' '

  return `${head}${connector}读取失败，多半是未认证：${AUTH_HINT}${suffix}`
}

interface DeniedMessageOptions {
  quote?: boolean
  /** LXT 的共享名失败要写成「host 共享」，其余类别没有这个中间词 */
  between?: string
  action?: string
}

export const deniedFailureMessage = (
  subject: string,
  options: DeniedMessageOptions = {},
): string => {
  const head = options.quote ? `「${subject}」` : ` ${subject}`
  const between = options.between ?? ''

  return `没有读取${head}${between}的权限，${
    options.action ?? '请联系 IT 开通'
  }`
}

export const summarize = (values: string[], max = 6): string =>
  values.length === 0
    ? '（空目录）'
    : values.length > max
      ? `${values.slice(0, max).join('、')} 等 ${values.length} 项`
      : values.join('、')

export interface LeafFailureInput {
  result: DirReadResult
  /** 展示给人看的路径或机台 */
  where: string
  brokenAt: NonNullable<ScanBranch['brokenAt']>
  /** 缺失层的期望名与实际子目录；有值时给出「下没有 X，实际存在 Y」 */
  detail?: { expected: string; actual: string[] }
  /** 前缀层目录名，用于「SaveImages 目录不存在」这类短文案 */
  baseName?: string
}

export interface LeafFailureResult {
  status: 'unreachable' | 'missing'
  reason?: ReadFailureReason
  missingName?: string
  message: string
  /** 原始错误码，供界面折叠诊断 */
  detail?: string
  networkSample: boolean
}

/**
 * 扫描执行器在一次目录读取失败后的完整结论。
 *
 * 注意输入保持窄：只给读取结果、展示路径、断链层级和可选的缺失详情；
 * 分类、文案、断网样本都在这一个 module 内决定。
 */
export const describeLeafFailure = (
  input: LeafFailureInput,
): LeafFailureResult => {
  const { result, where, brokenAt, detail, baseName } = input
  const classified = classifyReadStatus(result.status)
  const code = result.code ?? result.error?.split('\n')[0]?.trim()

  if (classified.reason === 'network') {
    return {
      status: 'unreachable',
      reason: 'network',
      message: networkFailureMessage(where, {
        quote: true,
        code,
        codeFallback: '网络超时',
      }),
      detail: code,
      networkSample: true,
    }
  }

  if (classified.reason === 'denied') {
    return {
      status: 'unreachable',
      reason: 'denied',
      message: deniedFailureMessage(where, {
        quote: true,
        action: '请联系 IT 开通该共享的读权限',
      }),
      detail: code,
      networkSample: false,
    }
  }

  if (classified.reason === 'auth') {
    return {
      status: 'unreachable',
      reason: 'auth',
      message: authFailureMessage(where, {
        quote: true,
        suffix: '，然后重新扫描',
      }),
      detail: code,
      networkSample: false,
    }
  }

  if (detail) {
    return {
      status: 'missing',
      missingName: detail.expected,
      message: `「${where}」下没有「${detail.expected}」，实际存在：${summarize(detail.actual)}`,
      detail: code,
      networkSample: false,
    }
  }

  return {
    status: 'missing',
    missingName:
      brokenAt === 'EL' ? 'EL' : brokenAt === '共享名' ? baseName : undefined,
    message: `「${where}」不存在`,
    detail: code,
    networkSample: false,
  }
}

/**
 * 入口目录读取失败的可读文案。
 *
 * settings.discoverMachines 与 discovery.discoverShortcutEntry 以前各自
 * 手写 ENOENT/EACCES 判断；统一到这里，阈值与用词只改一处。
 */
export const describeAccessError = (
  error: unknown,
  path: string,
  options: { noun?: string; permissionSuffix?: string } = {},
): string => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  const noun = options.noun ?? '目录'

  if (code === 'ENOENT') {
    return `${noun}不存在或已被移动：${path}，请重新选择`
  }

  if (code === 'EACCES' || code === 'EPERM') {
    return `没有读取「${path}」的权限，请检查${
      options.permissionSuffix ?? '目录访问权限'
    }`
  }

  return `无法访问「${path}」：${(error as Error)?.message ?? '未知错误'}`
}
