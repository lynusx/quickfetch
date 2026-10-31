import { readdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import type {
  LxtMachine,
  LxtSettings,
  LxtSkippedLink,
  Plant,
} from '../shared/ipc'

import { readLnk } from './lnk'
import { toFsPath } from './pathx'

/**
 * 力禧特机台识别。
 *
 * 入口结构是「根目录 / 厂区 / 机台.lnk」：
 *
 *   力禧特
 *   ├── 东区
 *   │   ├── 1A.lnk → \\10.108.8.232
 *   │   └── LX2.lnk → \\10.108.3.107
 *   └── 西区
 *       └── LX2.lnk → \\10.108.229.152
 *
 * 两个区的 LX2 同名不同机，所以机台唯一键必须是「厂区/机台」。
 * 厂区名直接取自子目录名，以后多一个「三区」不必改代码。
 */

export const LXT_ENTRY_NAME = '力禧特'

/** 机台唯一键；历史记录、复制分组都按它走 */
export const lxtKey = (plant: Plant, name: string): string => `${plant}/${name}`

export const defaultLxtSettings = (): LxtSettings => ({
  entryRoot: null,
  machines: [],
  skipped: [],
  updatedAt: null,
})

/** 自然序：7A 排在 10A 前面，跟现场习惯一致 */
const compareName = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

/** 入口里一个 .lnk 文件解析出来的东西 */
interface DiscoveredLink {
  plant: Plant
  name: string
  host: string
}

interface Discovery {
  machines: DiscoveredLink[]
  skipped: LxtSkippedLink[]
}

const isLnk = (name: string): boolean => name.toLowerCase().endsWith('.lnk')

/**
 * 扫一遍入口，解析其中所有 .lnk。
 *
 * 只读入口目录，不碰机台网络 —— 入口在办公网、机台在专用内网，
 * 识别阶段去连机台只会让界面卡在超时上。共享名（el / SaveImages）
 * 的探测放在扫描该机台时进行，见 scanner/resolver.ts。
 */
export const discoverLxt = async (entryRoot: string): Promise<Discovery> => {
  let zones

  try {
    zones = await readdir(toFsPath(entryRoot), { withFileTypes: true })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT') {
      throw new Error(`入口目录不存在或已被移动：${entryRoot}，请重新选择`)
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new Error(`没有读取「${entryRoot}」的权限，请检查目录访问权限`)
    }
    throw new Error(
      `无法访问「${entryRoot}」：${(error as Error)?.message ?? '未知错误'}`,
    )
  }

  const machines: DiscoveredLink[] = []
  const skipped: LxtSkippedLink[] = []

  // 厂区 = 含 .lnk 的直接子目录。只认这一层，避免把误放在根目录的
  // 说明文档、备份文件夹当成厂区。
  const zoneNames = zones
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort(compareName)

  for (const plant of zoneNames) {
    const zoneDir = join(entryRoot, plant)
    let entries

    try {
      entries = await readdir(toFsPath(zoneDir), { withFileTypes: true })
    } catch {
      skipped.push({
        plant,
        file: '（整个厂区）',
        reason: '无法读取该厂区目录',
      })
      continue
    }

    const links = entries
      .filter((entry) => entry.isFile() && isLnk(entry.name))
      .map((entry) => entry.name)
      .sort(compareName)

    // 没有 .lnk 的子目录不是厂区，连提示都不必给
    if (!links.length) continue

    for (const file of links) {
      const result = readLnk(join(zoneDir, file))

      if (!result.ok) {
        skipped.push({ plant, file, reason: result.reason })
        continue
      }

      machines.push({
        plant,
        // 去扩展名：7A.lnk → 7A
        name: basename(file, extname(file)),
        host: result.host,
      })
    }
  }

  if (!machines.length && !skipped.length) {
    throw new Error(
      `「${entryRoot}」下没有找到任何 .lnk，请确认选的是力禧特入口目录（其下应有东区、西区这类子文件夹）`,
    )
  }

  return { machines, skipped }
}

export interface MergeResult {
  machines: LxtMachine[]
  added: number
  removed: number
  relocated: number
}

/**
 * 把新识别到的结果并入已有配置。
 *
 * 三条规则：
 * - 新增的直接补进来
 * - 入口里消失的不删除，只标 stale —— 历史记录和复制分组还引用着它
 * - 目标地址变了的更新地址并清掉 share 缓存 —— 不清的话下次扫描
 *   还会按旧 IP 下探到的共享名去拼路径，扫出来全是「路径不存在」
 */
export const mergeLxtMachines = (
  previous: LxtMachine[],
  discovered: DiscoveredLink[],
): MergeResult => {
  const existing = new Map(previous.map((machine) => [machine.key, machine]))
  const seen = new Set<string>()

  let added = 0
  let relocated = 0

  for (const link of discovered) {
    const key = lxtKey(link.plant, link.name)
    seen.add(key)

    const before = existing.get(key)

    if (!before) {
      added += 1
      existing.set(key, {
        plant: link.plant,
        name: link.name,
        key,
        host: link.host,
        share: null,
        stale: false,
      })
      continue
    }

    const moved = before.host !== link.host
    if (moved) relocated += 1

    existing.set(key, {
      ...before,
      host: link.host,
      share: moved ? null : before.share,
      stale: false,
    })
  }

  // 入口里没出现的保留下来，只标 stale；下次识别到会重新变回可用
  let removed = 0
  for (const [key, machine] of existing) {
    if (seen.has(key)) continue

    if (!machine.stale) removed += 1

    existing.set(key, { ...machine, stale: true })
  }

  const machines = [...existing.values()].sort(
    (a, b) => compareName(a.plant, b.plant) || compareName(a.name, b.name),
  )

  return { machines, added, removed, relocated }
}
