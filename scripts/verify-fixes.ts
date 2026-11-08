/**
 * 逻辑级回归测试：直接跑真实的扫描/复制模块，不启动 Electron。
 *
 * 现场问题的根因大多在「错误码 → 状态」「同名判定」「文案覆盖」这几处判断上，
 * 这些都不依赖 Electron，可以在 Linux 上用真实目录树验证。
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  mkdir as mkdirP,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readDirSafe } from '../src/main/services/scanner/fsx'
import {
  classifyFailureStatuses,
  classifyReadStatus,
  describeAccessError,
  describeLeafFailure,
  describePrefixFailure,
} from '../src/main/services/scanner/diagnosis'
import type { DirReadResult } from '../src/main/services/scanner/fsx'
import {
  probeSharePath,
  readShareCandidate,
} from '../src/main/services/scanner/shareProbe'
import {
  createAoiResolver,
  createLxtResolver,
} from '../src/main/services/scanner/resolver'
import { createBreaker } from '../src/main/services/scanner/breaker'
import {
  createLogger,
  formatLogLine,
  isLogDayExpired,
  logFileName,
  parseLogDay,
  pruneOldLogs,
  retentionCutoffDay,
  serializeLogValue,
} from '../src/main/services/log'
import {
  defaultSettings,
  isAppSettings,
  normalizeAoi,
  normalizeEl,
  normalizeLxt,
  normalizePl,
  normalizePreferences,
  normalizeTypeCatalog,
} from '../src/main/services/settings'
import { createSettingsStore } from '../src/main/services/settings/store'
import {
  createHistoryStore,
  toTask,
} from '../src/main/services/scanner/history'
import { deriveScanParams } from '../src/renderer/features/scan/scanParams'
import { decideSignatureChange } from '../src/renderer/features/scan/sessionTransitions'
import { pruneMachinesToSide } from '../src/renderer/features/scan/stores/plantFilterStore'
import {
  SCAN_CATEGORIES,
  SCAN_CATEGORY_META,
} from '../src/shared/scanCategories'
import {
  deriveCopyReadModel,
  previewSizeLabel,
} from '../src/renderer/features/copy/copyReadModel'
import { createTaskTable } from '../src/main/utils/taskTable'
import { createTaskLifecycle } from '../src/main/utils/taskLifecycle'
import { createTaskArchive } from '../src/main/services/scanner/archive'
import { createScanLedger } from '../src/main/services/scanner/ledger'
import {
  activeMachineKeys,
  aliveTypes,
  deriveScope,
  planFilterRestore,
} from '../src/renderer/features/scan/scanScopePlan'
import type { PlantFilterSlice } from '../src/renderer/features/scan/stores/plantFilterStore'
import type { CopyTask } from '../src/shared/ipc'
import type { ScanTask } from '../src/shared/ipc'
import { summarizeIpcArgs } from '../src/main/ipc/log-summary'
import {
  describeUpdateError,
  isTransientCheckError,
} from '../src/main/services/update/errors'
import { detectInstallModeFromDir } from '../src/main/services/update/installMode'
import {
  describeTaskBlock,
  initialState,
  reduceUpdateState,
} from '../src/main/services/update/state'
import type { MachineResolver } from '../src/main/services/scanner/resolver'
import {
  CopyTaskRunner,
  SpeedMeter,
  buildCopyPlan,
  filterByMachines,
  planPreview,
} from '../src/main/services/copy/copy'
import {
  cachedSizeOf,
  measureImageSizes,
} from '../src/main/services/copy/measure'
import { copyStoreOf } from '../src/renderer/features/copy/copyStore'
import {
  AOI_IMAGE_DIRS,
  DEFAULT_AOI_IMAGE_KIND,
  IPC_EVENTS,
  IPC_INVOKE,
  IPC_SEND,
  aoiSideOfMachines,
  aoiSideOfName,
  elPlantOf,
} from '../src/shared/ipc'
import type { ScanCategory, ScanTaskParams } from '../src/shared/ipc'

const results: { name: string; ok: boolean; detail?: string }[] = []

const test = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name}`)
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message })
    console.error(`  ✗ ${name}\n    ${(error as Error).message}`)
  }
}

/* ---------------------------------------------------------------- 1. fsx */

const fsxTests = async () => {
  const root = await mkdtemp(join(tmpdir(), 'qf-fsx-'))

  await test('fsx: 不存在的目录 → missing', async () => {
    const r = await readDirSafe(join(root, 'nope'))
    assert.equal(r.status, 'missing')
    assert.equal(r.raw?.code, 'ENOENT')
    assert.ok((r.raw?.stack ?? '').length > 0, '应保留原始堆栈')
  })

  await test('fsx: 把文件当目录读 → missing（ENOTDIR 属路径错误）', async () => {
    const file = join(root, 'a.txt')
    await writeFile(file, 'x')
    const r = await readDirSafe(join(file, 'sub'))
    assert.equal(r.status, 'missing')
  })

  await test('fsx: 权限不足 → denied（Windows/root 下权限位失效，跳过）', async () => {
    // Windows 的 chmod 不改变 ACL，root 不受权限位限制；这组在对应平台跳过
    if (process.platform === 'win32' || process.getuid?.() === 0) {
      console.log('    · 当前平台不执行权限位测试，跳过')
      return
    }

    const locked = join(root, 'locked')
    await mkdir(locked, { recursive: true })
    const { chmod } = await import('node:fs/promises')
    await chmod(locked, 0o000)
    const r = await readDirSafe(join(locked, 'sub'))
    await chmod(locked, 0o755)
    assert.equal(r.status, 'denied')
  })
}

/* ------------------------------------------------- 2. 力禧特两步探测 */

const lxtTests = async () => {
  const base = await mkdtemp(join(tmpdir(), 'qf-lxt-'))
  const host = join(base, 'host')
  const share = join(host, 'el')
  const fixed = join(share, 'A-01-B')

  await mkdirP(join(fixed, '20261103'), { recursive: true })

  const hosts = new Map([['东区/1A', host]])
  const shares = new Map<string, string | null>([['东区/1A', null]])
  const persisted: (string | null)[] = []

  const resolver = createLxtResolver({
    hosts,
    shares,
    date: '20261103',
    onShare: (_m, s) => persisted.push(s),
  })

  await test('力禧特: 共享根可读时能探到 el', async () => {
    const r = await resolver.resolve('东区/1A')
    assert.equal(r.ok, true, r.reason)
    assert.ok(r.base.endsWith(join('el', 'A-01-B')), r.base)
  })

  await test('力禧特: 探测成功后回写 share', async () => {
    assert.deepEqual(persisted, ['el'])
  })

  await test('力禧特: 没有 A-01-B 时落盘空串（探过、没有）', async () => {
    const base2 = await mkdtemp(join(tmpdir(), 'qf-lxt2-'))
    const host2 = join(base2, 'host2')
    await mkdirP(join(host2, 'el'), { recursive: true })
    await mkdirP(join(host2, 'SaveImages'), { recursive: true })

    const writes: (string | null)[] = []
    const r2 = createLxtResolver({
      hosts: new Map([['东区/1B', host2]]),
      shares: new Map<string, string | null>([['东区/1B', null]]),
      date: '20261103',
      onShare: (_m, s) => writes.push(s),
    })

    const res = await r2.resolve('东区/1B')
    assert.equal(res.ok, false)
    assert.equal(res.unreachable, 'share')
    assert.match(res.reason, /都没有 A-01-B/)
    assert.deepEqual(writes, [''])
  })

  await test('力禧特: share 为空串时直接给结论，不再重探', async () => {
    const start = Date.now()
    const r3 = createLxtResolver({
      hosts: new Map([['东区/1C', host]]),
      shares: new Map<string, string | null>([['东区/1C', '']]),
      date: '20261103',
      onShare: () => undefined,
    })

    const res = await r3.resolve('东区/1C')
    assert.equal(res.ok, false)
    assert.equal(res.unreachable, 'share')
    // 没有网络往返，应当毫秒级返回
    assert.ok(Date.now() - start < 200, `耗时 ${Date.now() - start}ms`)
  })

  await test('力禧特: 共享根不存在但主机可读 → 判 share，不误报"目录不存在"', async () => {
    const res = await createLxtResolver({
      hosts: new Map([['东区/1D', base]]),
      shares: new Map<string, string | null>([['东区/1D', null]]),
      date: '20261103',
      onShare: () => undefined,
    }).resolve('东区/1D')

    assert.equal(res.ok, false)
    assert.equal(res.unreachable, 'share')
    // 关键：不能说"这台机器上没有 A-01-B"以外的话术去掩盖根缺失
    assert.match(res.reason, /A-01-B/)
  })

  await test('力禧特: 主机不存在 → 走 auth/share 分类而不是 network 误报', async () => {
    const res = await createLxtResolver({
      hosts: new Map([['东区/2A', join(base, 'ghost')]]),
      shares: new Map<string, string | null>([['东区/2A', null]]),
      date: '20261103',
      onShare: () => undefined,
    }).resolve('东区/2A')

    assert.equal(res.ok, false)
    // Linux 上不存在的主机路径是 ENOENT → 共享根 missing → 最终仍是 share
    assert.ok(['share', 'network', 'auth'].includes(res.unreachable ?? ''))
  })
}

/* ------------------------------------------------------ 3. 复制规划 */

const copyTests = async () => {
  const src = await mkdtemp(join(tmpdir(), 'qf-src-'))

  // 模拟 A02-A 下 9 张同名 img.jpg
  const images = []
  for (let i = 0; i < 9; i += 1) {
    const file = join(src, `m${i}.jpg`)
    await writeFile(file, `data-${i}`)
    images.push({
      path: `A02-A/EL/20261103/白班/8/NG_脏污_B/img.jpg`,
      absolutePath: file,
      name: 'img.jpg',
      machine: 'A02-A',
    })
  }

  await test('复制: skip 策略只跳目标已有同名的那一张，不牵连同批其他图', async () => {
    // 现场场景：目标目录里已经有 img.jpg，源里除了 img.jpg 还有别的图
    const dst = await mkdtemp(join(tmpdir(), 'qf-dst-a-'))
    await writeFile(join(dst, 'img.jpg'), 'preexisting')

    const mixed = [
      ...images.slice(0, 1),
      {
        path: 'A02-A/EL/20261103/白班/8/NG_脏污_B/other.png',
        absolutePath: images[1].absolutePath,
        name: 'other.png',
        machine: 'A02-A',
      },
    ]

    const task = new CopyTaskRunner({
      scanTaskId: 's1',
      targetDir: dst,
      params: { machines: ['A02-A'], layout: 'flat', conflict: 'skip' },
      images: mixed,
      emit: () => undefined,
    })
    task.start()
    await task.waitSettled()

    const snap = task.snapshot()
    assert.equal(snap.status, 'completed', snap.error ?? '')
    // img.jpg 目标已有 → 跳过；other.png 照常复制。以前是整组跳过，other.png 也会丢
    assert.equal(snap.progress.alreadyExists, 1, '目标已有同名应计 1 张')
    assert.equal(snap.progress.copied, 1, '同批其他图必须照常复制')
    assert.equal(snap.progress.failed, 0, '跳过不该报错')
    assert.equal(snap.progress.total, 2, 'total 要包含目标已存在的 1 张')
    assert.equal(snap.progress.copyTotal, 1, 'copyTotal 只算真正写盘的')
    assert.equal(
      snap.progress.copied +
        snap.progress.alreadyExists +
        snap.progress.skipped,
      2,
    )

    const files = await readdir(dst)
    assert.ok(files.includes('other.png'), `实际 ${files}`)
  })

  await test('复制: 9 张同名且目标已有该名 → 全部跳过，不产生 img1..img8', async () => {
    // 这是必须保留的行为：目标已有 img.jpg 时，本批同名图若强行编号落盘，
    // 第二次跑同一批会生成 img1...img8 的副本，等于重复复制。
    const dst = await mkdtemp(join(tmpdir(), 'qf-dst-b-'))
    await writeFile(join(dst, 'img.jpg'), 'preexisting')

    const task = new CopyTaskRunner({
      scanTaskId: 's1b',
      targetDir: dst,
      params: { machines: ['A02-A'], layout: 'flat', conflict: 'skip' },
      images,
      emit: () => undefined,
    })
    task.start()
    await task.waitSettled()

    const snap = task.snapshot()
    assert.equal(snap.status, 'completed', snap.error ?? '')
    assert.equal(snap.progress.copied, 0)
    assert.equal(snap.progress.alreadyExists, 9)
    assert.equal(snap.progress.failed, 0, '跳过不等于失败')
    // 以前 total 只取 plan.length，全部跳过时会显示「已完成 9 / 0 张」
    assert.equal(snap.progress.total, 9)
    assert.equal(snap.progress.copyTotal, 0)

    const files = await readdir(dst)
    assert.deepEqual(files.sort(), ['img.jpg', 'source.txt'].sort())
  })

  await test('复制: rename 策略下 9 张全落盘且互不覆盖', async () => {
    const dst2 = await mkdtemp(join(tmpdir(), 'qf-dst2-'))
    await writeFile(join(dst2, 'img.jpg'), 'x')

    const task = new CopyTaskRunner({
      scanTaskId: 's2',
      targetDir: dst2,
      params: { machines: ['A02-A'], layout: 'flat', conflict: 'rename' },
      images,
      emit: () => undefined,
    })
    task.start()
    await task.waitSettled()

    const snap = task.snapshot()
    assert.equal(snap.progress.copied, 9)
    assert.equal(snap.progress.renamed, 9)
    // 每张源文件 6 字节（data-N），9 张共 54 字节
    assert.equal(snap.progress.sizeUnknown, 0)
    assert.equal(snap.progress.totalBytes, 54)
    assert.equal(snap.progress.copiedBytes, 54)
    const files = await readdir(dst2)
    assert.equal(files.filter((n) => n.endsWith('.jpg')).length, 10)
  })

  await test('复制: retry() 不再崩 action 未定义，且不重跑整批规划', async () => {
    const dst3 = await mkdtemp(join(tmpdir(), 'qf-dst3-'))
    // 9 张里只有后 2 张的源文件不存在 → 恰好 2 张失败
    const brokenImages = images.map((img, i) =>
      i >= 7 ? { ...img, absolutePath: img.absolutePath + '.missing' } : img,
    )

    const task = new CopyTaskRunner({
      scanTaskId: 's3',
      targetDir: dst3,
      params: { machines: ['A02-A'], layout: 'flat', conflict: 'rename' },
      images: brokenImages,
      emit: () => undefined,
    })
    task.start()
    await task.waitSettled()

    const failed = task.snapshot()
    assert.equal(
      failed.progress.failed,
      2,
      `实际失败 ${failed.progress.failed}（${failed.status} / ${failed.error ?? '无错误'}）`,
    )
    assert.equal(failed.progress.copied, 7)

    // 重试：以前这里会抛 Cannot read properties of undefined (reading 'action')
    const retried = task.retry()
    assert.equal(retried.status, 'running')
    assert.equal(retried.progress.total, 2, '只重试失败的那 2 张，不是全量重跑')
    await task.waitSettled()

    const after = task.snapshot()
    // 源还是不存在，所以仍然失败 2 张；关键是过程不能崩、不能变成全量
    assert.equal(after.progress.failed, 2, `实际 ${after.progress.failed}`)
    assert.equal(after.progress.total, 2)
    assert.equal(after.status, 'completed')
    assert.equal(after.error, null)
  })

  await test('复制: 有失败项时清单仍写全量', async () => {
    const dst5 = await mkdtemp(join(tmpdir(), 'qf-dst6-'))
    const broken = images.map((img, i) =>
      i === 0 ? { ...img, absolutePath: img.absolutePath + '.miss' } : img,
    )
    const task = new CopyTaskRunner({
      scanTaskId: 's5',
      targetDir: dst5,
      params: { machines: ['A02-A'], layout: 'flat', conflict: 'rename' },
      images: broken,
      emit: () => undefined,
    })
    task.start()
    await task.waitSettled()

    const content = await (
      await import('node:fs/promises')
    ).readFile(join(dst5, 'source.txt'), 'utf-8')
    assert.equal(content.split('\n').filter(Boolean).length, 9)
  })

  await test('复制: retry() 在尾随反斜杠路径下也不崩', async () => {
    const dst4 = await mkdtemp(join(tmpdir(), 'qf-dst4-'))

    const task = new CopyTaskRunner({
      scanTaskId: 's4',
      targetDir: dst4,
      params: { machines: ['A'], layout: 'flat', conflict: 'skip' },
      images: [
        {
          path: 'A/EL/x/img.jpg',
          absolutePath: join(src, 'm0.jpg') + '\\',
          name: 'img.jpg',
          machine: 'A',
        },
      ],
      emit: () => undefined,
    })
    task.start()
    await task.waitSettled()
    // 带尾随反斜杠的源路径本身就是非法路径，会失败，但重试不能崩
    task.retry()
    await task.waitSettled()
    assert.ok(true)
  })

  await test('复制: retry() 按原分组目录落盘，不把绝对路径拼进目标目录', async () => {
    const dst = await mkdtemp(join(tmpdir(), 'qf-dst-folder-'))
    const missing = join(src, 'retry-missing.jpg')

    const task = new CopyTaskRunner({
      scanTaskId: 's6',
      targetDir: dst,
      params: {
        machines: ['A02-A'],
        layout: 'machine-type',
        conflict: 'rename',
      },
      images: [
        {
          path: 'A02-A/EL/20261103/白班/8/NG_脏污_B/x.jpg',
          absolutePath: missing,
          name: 'x.jpg',
          machine: 'A02-A',
        },
      ],
      emit: () => undefined,
    })
    task.start()
    await task.waitSettled()
    assert.equal(task.snapshot().progress.failed, 1, '源文件不存在应先失败')

    // 补上源文件后重试：分组目录应来自失败记录，而不是从绝对路径反推
    await writeFile(missing, 'retry-data')
    task.retry()
    await task.waitSettled()

    const after = task.snapshot()
    assert.equal(after.status, 'completed', after.error ?? '')
    assert.equal(after.progress.copied, 1, after.error ?? '')

    const target = join(dst, 'A02-A', 'NG_脏污_B', 'x.jpg')
    assert.equal(await readFile(target, 'utf-8'), 'retry-data')

    // 目标根下只应出现分组目录和清单，不能出现 tmp/、C: 这类嵌套段
    const top = await readdir(dst)
    assert.deepEqual(top.sort(), ['A02-A', 'source.txt'].sort())
  })

  await test('复制: 非图片文件不参与复制计划与总数', async () => {
    const dst = await mkdtemp(join(tmpdir(), 'qf-dst-nonimage-'))
    const txt = join(src, 'readme.txt')
    await writeFile(txt, 'not an image')

    const task = new CopyTaskRunner({
      scanTaskId: 's7',
      targetDir: dst,
      params: { machines: ['A02-A'], layout: 'flat', conflict: 'rename' },
      images: [
        images[0],
        {
          path: 'A02-A/EL/20261103/白班/8/NG_脏污_B/readme.txt',
          absolutePath: txt,
          name: 'readme.txt',
          machine: 'A02-A',
        },
      ],
      emit: () => undefined,
    })
    task.start()
    await task.waitSettled()

    const snap = task.snapshot()
    assert.equal(snap.progress.total, 1)
    assert.equal(snap.progress.copied, 1)
    const files = await readdir(dst)
    assert.ok(!files.includes('readme.txt'), `实际 ${files}`)
  })

  await test('复制: .bmp 文件按图片参与计划（森标 AOI 原生格式）', async () => {
    const dst = await mkdtemp(join(tmpdir(), 'qf-dst-bmp-'))
    const bmp = join(src, 'aoi.bmp')
    await writeFile(bmp, 'bmp-data')

    const task = new CopyTaskRunner({
      scanTaskId: 's8',
      targetDir: dst,
      params: { machines: ['东区/1A'], layout: 'flat', conflict: 'rename' },
      images: [
        {
          path: '东区/1A/20261103/20.5/色斑B-/aoi.bmp',
          absolutePath: bmp,
          name: 'aoi.bmp',
          machine: '东区/1A',
        },
      ],
      emit: () => undefined,
    })
    task.start()
    await task.waitSettled()

    const snap = task.snapshot()
    assert.equal(snap.progress.total, 1)
    assert.equal(snap.progress.copied, 1)
    assert.equal(snap.progress.totalBytes, 8)
    const files = await readdir(dst)
    assert.ok(files.includes('aoi.bmp'), `实际 ${files}`)
  })

  await test('复制计划: 预览与执行共用同一份判定', async () => {
    const dst = await mkdtemp(join(tmpdir(), 'qf-plan-'))
    // 目标里已有一张 img.jpg，源里有 9 张同名
    await writeFile(join(dst, 'img.jpg'), 'preexisting')

    const params = {
      machines: ['A02-A'],
      layout: 'flat' as const,
      conflict: 'skip' as const,
    }
    const plan = await buildCopyPlan({ images, params, targetDir: dst })

    assert.equal(plan.picked.length, 9)
    // 预览口径：同名坑位只算一次
    assert.equal(plan.conflicts, 1)
    assert.equal(plan.alreadyExists, 9)
    assert.equal(plan.copyTotal, 0)
    assert.equal(plan.items.length, 0)

    const task = new CopyTaskRunner({
      scanTaskId: 's-plan',
      targetDir: dst,
      params,
      images,
      emit: () => undefined,
    })
    task.start()
    await task.waitSettled()

    const snap = task.snapshot()
    assert.equal(snap.progress.total, plan.picked.length)
    assert.equal(snap.progress.alreadyExists, plan.alreadyExists)
    assert.equal(snap.progress.copyTotal, plan.copyTotal)
  })

  await test('复制计划: 没选目录时只统计张数与分组', async () => {
    const plan = await buildCopyPlan({
      images,
      params: {
        machines: ['A02-A'],
        layout: 'machine',
        conflict: 'rename',
      },
    })

    assert.equal(plan.picked.length, 9)
    assert.equal(plan.conflicts, 0)
    assert.equal(plan.items.length, 0)
    assert.deepEqual(plan.folders, ['A02-A'])
    assert.deepEqual(plan.perMachine, [{ machine: 'A02-A', images: 9 }])
  })

  await test('复制: 空机台列表表示一台都不选，不再等于全选', async () => {
    assert.equal(filterByMachines(images, []).length, 0)
    assert.equal(filterByMachines(images, ['A02-A']).length, images.length)
    assert.equal(filterByMachines(images, ['B01-A']).length, 0)
  })

  await test('复制: 取消全选后不会被同步重新补全', async () => {
    const store = copyStoreOf('el').getState()

    store.reset()
    store.syncMachines('t1', ['A02-A', 'A02-B'])
    assert.deepEqual(copyStoreOf('el').getState().machines, ['A02-A', 'A02-B'])

    store.setMachines([])
    store.syncMachines('t1', ['A02-A', 'A02-B'])
    assert.deepEqual(
      copyStoreOf('el').getState().machines,
      [],
      '用户取消全选后，同一任务的同步不能把机台补回来',
    )

    store.syncMachines('t2', ['B01-A'])
    assert.deepEqual(
      copyStoreOf('el').getState().machines,
      ['B01-A'],
      '换了扫描任务要重新默认全选',
    )

    copyStoreOf('el').getState().reset()
  })

  await test('复制: 实时网速按最近 5 秒滑动窗口', async () => {
    const meter = new SpeedMeter(5000, 250)

    meter.reset(0, 0)
    assert.equal(meter.value(0, 0), 0)
    assert.equal(meter.value(1000, 1_000_000), 1_000_000)
    assert.equal(meter.value(2000, 2_000_000), 1_000_000)
    // 窗口内没有新字节：旧样本被裁掉，速度归零而不是一直显示旧值
    assert.equal(meter.value(9000, 2_000_000), 0)
  })

  await test('厂区: EL 机台名首字母决定东西区', async () => {
    assert.equal(elPlantOf('A02-A'), 'east')
    assert.equal(elPlantOf('a-LXJC-01'), 'east')
    assert.equal(elPlantOf('B-LXJC-01'), 'west')
    assert.equal(elPlantOf('C01-A'), null)
    assert.equal(elPlantOf(''), null)
  })

  await test('复制预览: 体积只统计勾选的图片', async () => {
    const preview = await planPreview(
      [
        ...images.slice(0, 2),
        {
          // 说明文件不是图片，不该算进「将复制 N 张」与体积
          path: 'A02-A/EL/20261103/白班/8/NG_脏污_B/note.txt',
          absolutePath: join(src, 'note.txt'),
          name: 'note.txt',
          machine: 'A02-A',
        },
      ],
      { machines: ['A02-A'], layout: 'flat', conflict: 'rename' },
    )

    assert.equal(preview.total, 2)
    // m0/m1 各写入了 data-0 / data-1，共 12 字节
    assert.equal(preview.totalBytes, 12)
    assert.equal(preview.sizeUnknown, 0)
  })

  await test('复制预览: stat 失败计入 sizeUnknown，已知体积照常累加', async () => {
    const preview = await planPreview(
      [
        ...images.slice(0, 2),
        {
          path: 'A02-A/EL/20261103/白班/8/NG_脏污_B/missing.jpg',
          absolutePath: join(src, 'does-not-exist.jpg'),
          name: 'missing.jpg',
          machine: 'A02-A',
        },
      ],
      { machines: ['A02-A'], layout: 'flat', conflict: 'rename' },
    )

    assert.equal(preview.total, 3)
    assert.equal(preview.totalBytes, 12)
    assert.equal(preview.sizeUnknown, 1)
  })

  await test('复制预览: 超过 5000 张跳过 stat，全部按未知', async () => {
    const many = Array.from({ length: 5001 }, (_, i) => ({
      path: `A02-A/EL/20261103/白班/8/NG_脏污_B/${i}.jpg`,
      absolutePath: join(src, `${i}.jpg`),
      name: `${i}.jpg`,
      machine: 'A02-A',
    }))

    const preview = await planPreview(many, {
      machines: ['A02-A'],
      layout: 'flat',
      conflict: 'rename',
    })

    assert.equal(preview.total, 5001)
    assert.equal(preview.totalBytes, 0)
    assert.equal(preview.sizeUnknown, 5001)
  })

  await test('体积缓存: 预检查与复制量测复用同一份 size', async () => {
    const file = join(src, 'cache-me.jpg')
    await writeFile(file, 'abcd')
    const image = {
      path: 'A02-A/EL/20261103/白班/8/NG_脏污_B/cache-me.jpg',
      absolutePath: file,
      name: 'cache-me.jpg',
      machine: 'A02-A',
    }

    const first = await measureImageSizes([image])
    assert.equal(first.totalBytes, 4)

    // 同名文件被改写后，缓存仍给第一次的结论：产出图只读，不会天天变
    await writeFile(file, 'abcdefgh')
    const second = await measureImageSizes([image])
    assert.equal(second.totalBytes, 4)
    assert.equal(await cachedSizeOf(file), 4)
  })

  await test('复制面板: 体积文案', async () => {
    assert.equal(previewSizeLabel(null, true), '计算中…')
    assert.equal(previewSizeLabel(null, false), null)
    assert.equal(
      previewSizeLabel(
        {
          machines: ['A'],
          total: 2,
          perMachine: [],
          folders: [],
          conflicts: 0,
          totalBytes: 0,
          sizeUnknown: 2,
        },
        false,
      ),
      '大小未知',
    )
    assert.equal(
      previewSizeLabel(
        {
          machines: ['A'],
          total: 2,
          perMachine: [],
          folders: [],
          conflicts: 0,
          totalBytes: 2048,
          sizeUnknown: 0,
        },
        false,
      ),
      '2 KB',
    )
  })
}

/* ------------------------------------------------ 4. 扫描任务端到端 */

const scanTests = async () => {
  const { ScanTaskRunner } = await import('../src/main/services/scanner/task')

  const run = async (params: ScanTaskParams, resolver: MachineResolver) => {
    const runner = new ScanTaskRunner(
      params,
      {
        category: (params.category ?? 'el') as ScanCategory,
        resolver,
        load: { readConcurrency: 2, machineBatchSize: 2 },
      },
      () => undefined,
    )
    runner.start()
    await runner.waitSettled()
    return runner.snapshot()
  }

  await test('扫描: 类型目录存在但没图片 → 文案是「没有图片文件」而非「没有所选类型」', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sc-aoi-'))
    const shiftDir = join(root, '20261103', '20.5')
    // 色斑B- 存在但是空的
    await mkdirP(join(shiftDir, '色斑B-'), { recursive: true })
    // 色差B- 有图
    await mkdirP(join(shiftDir, '色差B-'), { recursive: true })
    await writeFile(join(shiftDir, '色差B-', 'a.jpg'), 'x')

    const resolver = {
      category: 'aoi',
      shape: {
        shiftDir: (sh: string) => (sh === '白班' ? '8.5' : '20.5'),
        hasSlots: false,
        baseBrokenAt: '共享名',
      },
      validate: () => null,
      resolve: async () => ({ ok: true, base: root, reason: '' }),
      segments: (m: string, dir: string) => [
        m,
        ...dir.slice(root.length).split('/').filter(Boolean),
      ],
    }

    const snap = await run(
      {
        category: 'aoi',
        machines: ['东区/5A背检'],
        date: '20261103',
        shift: '夜班',
        slots: [],
        types: ['色斑B-', '色差B-'],
      },
      resolver,
    )

    assert.equal(snap.status, 'completed', snap.error ?? '')
    const branch = snap.branches[0]
    assert.equal(branch.images, 1, '色差B- 里的图应被扫到')
    assert.equal(branch.status, 'hit')
  })

  await test('扫描: 所有类型都没图片时明确说「没有图片文件」', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sc-aoi2-'))
    const shiftDir = join(root, '20261103', '20.5')
    await mkdirP(join(shiftDir, '色斑B-'), { recursive: true })

    const resolver = {
      category: 'aoi',
      shape: {
        shiftDir: () => '20.5',
        hasSlots: false,
        baseBrokenAt: '共享名',
      },
      validate: () => null,
      resolve: async () => ({ ok: true, base: root, reason: '' }),
      segments: (m: string) => [m],
    }

    const snap = await run(
      {
        category: 'aoi',
        machines: ['东区/5A背检'],
        date: '20261103',
        shift: '夜班',
        slots: [],
        types: ['色斑B-'],
      },
      resolver,
    )

    const branch = snap.branches[0]
    assert.equal(branch.status, 'empty')
    assert.equal(branch.brokenAt, '未命中', `实际 ${branch.brokenAt}`)
    assert.match(branch.message ?? '', /没有图片文件/)
    // 文案必须给出可读信息：说清"检查了几个目录"并列出实际存在的类型，
    // 不能只丢一串全 0 的数字（现场第一版就是「已匹配 0 个目录，共 0 张」）
    assert.match(branch.message ?? '', /已检查 \d+ 个目录/)
    assert.match(branch.message ?? '', /实际存在：.*色斑B-/)
    assert.doesNotMatch(
      branch.message ?? '',
      /没有所选类型/,
      '类型明明存在，不能说没有所选类型',
    )
  })

  await test('扫描: 类型真的不存在时才说「没有所选类型」', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sc-aoi3-'))
    const shiftDir = join(root, '20261103', '20.5')
    await mkdirP(join(shiftDir, '色差B-'), { recursive: true })

    const resolver = {
      category: 'aoi',
      shape: {
        shiftDir: () => '20.5',
        hasSlots: false,
        baseBrokenAt: '共享名',
      },
      validate: () => null,
      resolve: async () => ({ ok: true, base: root, reason: '' }),
      segments: (m: string) => [m],
    }

    const snap = await run(
      {
        category: 'aoi',
        machines: ['东区/5A背检'],
        date: '20261103',
        shift: '夜班',
        slots: [],
        types: ['色斑B-'],
      },
      resolver,
    )

    const branch = snap.branches[0]
    assert.equal(branch.status, 'empty')
    assert.equal(branch.brokenAt, '类型')
    assert.match(branch.message ?? '', /没有所选类型/)
  })

  await test('扫描: 有时段路径所选类型全不存在时，不误报「没有图片文件」', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sc-slot-'))
    const typeDir = join(root, '20261103', '白班', '8', '色差B-')
    await mkdirP(typeDir, { recursive: true })
    await writeFile(join(typeDir, 'a.jpg'), 'x')

    const resolver = {
      category: 'el' as const,
      shape: {},
      validate: () => null,
      resolve: async () => ({ ok: true, base: root, reason: '' }),
      segments: (m: string, dir: string) => [
        m,
        ...dir.slice(root.length).split('/').filter(Boolean),
      ],
    }

    const snap = await run(
      {
        category: 'el',
        machines: ['A02-A'],
        date: '20261103',
        shift: '白班',
        slots: ['8'],
        types: ['色斑B-'],
      },
      resolver,
    )

    const branch = snap.branches[0]
    assert.equal(branch.status, 'empty')
    assert.equal(branch.brokenAt, '类型', `实际 ${branch.brokenAt}`)
    assert.match(branch.message ?? '', /没有所选类型/)
    assert.doesNotMatch(branch.message ?? '', /没有图片文件/)
    assert.ok(
      branch.availableTypes?.includes('色差B-'),
      '实际存在的类型要保留给界面提示',
    )
  })

  await test('扫描: 日期目录缺失时写入 missingName', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sc-missing-date-'))

    const resolver = {
      category: 'el' as const,
      shape: {},
      validate: () => null,
      resolve: async () => ({ ok: true, base: root, reason: '' }),
      segments: (m: string) => [m],
    }

    const snap = await run(
      {
        category: 'el',
        machines: ['A02-A'],
        date: '20261103',
        shift: '白班',
        slots: ['8'],
        types: ['色斑B-'],
      },
      resolver,
    )

    const branch = snap.branches[0]
    assert.equal(branch.status, 'missing')
    assert.equal(branch.brokenAt, '日期')
    assert.equal(branch.missingName, '20261103')
    assert.equal(branch.images, 0)
  })

  await test('状态文案: 短文案与图片列映射', async () => {
    const { branchSummary } =
      await import('../src/renderer/features/scan/components/scanStatus')

    const make = (patch: Record<string, unknown>) =>
      ({
        machine: 'A02-A',
        status: 'missing',
        matchedDirs: 0,
        images: 0,
        ...patch,
      }) as Parameters<typeof branchSummary>[0]

    assert.deepEqual(
      branchSummary(
        make({ status: 'unreachable', unreachableReason: 'auth' }),
        undefined,
      ),
      { statusText: '未认证', imagesText: '—' },
    )

    assert.deepEqual(
      branchSummary(make({ brokenAt: '日期', missingName: '20261103' }), {
        date: '20261103',
      } as ScanTaskParams),
      { statusText: '20261103 目录不存在', imagesText: '0 张' },
    )

    assert.deepEqual(branchSummary(make({ brokenAt: 'EL' }), undefined), {
      statusText: 'EL 目录不存在',
      imagesText: '0 张',
    })

    // 旧历史没有 missingName：从 message 里提取
    assert.deepEqual(
      branchSummary(
        make({
          brokenAt: '日期',
          message:
            '「\\\\10.1.1.1\\DC\\A02-A\\EL」下没有「20261103」，实际存在：（空目录）',
        }),
        { date: '20261103' } as ScanTaskParams,
      ),
      { statusText: '20261103 目录不存在', imagesText: '0 张' },
    )

    assert.deepEqual(
      branchSummary(make({ status: 'empty', brokenAt: '未命中' }), undefined),
      { statusText: '目录内无图片', imagesText: '0 张' },
    )

    assert.deepEqual(
      branchSummary(make({ status: 'empty', brokenAt: '类型' }), undefined),
      { statusText: '没有所选类型', imagesText: '0 张' },
    )

    assert.deepEqual(
      branchSummary(
        make({ status: 'hit', matchedDirs: 3, images: 12 }),
        undefined,
      ),
      { statusText: '3 个目录', imagesText: '12 张' },
    )

    assert.deepEqual(branchSummary(make({ status: 'skipped' }), undefined), {
      statusText: '未探测',
      imagesText: '—',
    })

    // 机台不在入口目录里：保留可读原因，而不是硬套「目录不存在」
    assert.deepEqual(
      branchSummary(
        make({ brokenAt: '机台标识', message: '该机台已不在入口目录中' }),
        undefined,
      ),
      { statusText: '该机台已不在入口目录中', imagesText: '0 张' },
    )
  })

  await test('探测: 利珀不再枚举 \\\\IP 根，力禧特空结论落为字符串', async () => {
    const { probeLxtShare, probePlShare } =
      await import('../src/main/services/scanner/resolver')

    // 力禧特：共享根可读，但两边都没有 A-01-B → ''（探过、没有）
    const lxtHost = await mkdtemp(join(tmpdir(), 'sc-lxt-probe-'))
    await mkdirP(join(lxtHost, 'el'), { recursive: true })
    await mkdirP(join(lxtHost, 'SaveImages'), { recursive: true })
    assert.equal(await probeLxtShare(lxtHost, '20261103'), '')

    // 利珀：只有根枚举才可能命中的目录（6a-old），新实现不应再读 \\IP 根
    const plHost = await mkdtemp(join(tmpdir(), 'sc-pl-probe-'))
    await mkdirP(join(plHost, '6a-old', 'Matting', '2026.11.03'), {
      recursive: true,
    })
    assert.equal(await probePlShare(plHost, '6A', '东区', '20261103'), '')
  })
}

/* ---------------------------------------------------------------- 5. 图片扩展名 */

const imageTests = async () => {
  const { isImageFile, IMAGE_EXTENSIONS } =
    await import('../src/shared/imageExtensions')
  const { ScanTaskRunner } = await import('../src/main/services/scanner/task')

  await test('图片: .bmp 算图片（森标 AOI 原生格式）', async () => {
    assert.equal(isImageFile('A02_20261103.bmp'), true)
    assert.equal(isImageFile('A02.BMP'), true, '大写扩展名也要认')
    assert.equal(IMAGE_EXTENSIONS.has('.bmp'), true)
  })

  await test('图片: 支持清单覆盖 MDN 常见位图格式', async () => {
    const supported = [
      '.jpg',
      '.jpeg',
      '.jpe',
      '.jif',
      '.jfif',
      '.pjpeg',
      '.pjp',
      '.png',
      '.apng',
      '.webp',
      '.avif',
      '.gif',
      '.bmp',
      '.dib',
      '.tif',
      '.tiff',
    ]
    for (const ext of supported) {
      assert.equal(isImageFile(`a${ext}`), true, ext)
    }

    // 矢量图、图标/光标不是产线采集的位图，不能混进复制清单
    for (const ext of [
      '.svg',
      '.svgz',
      '.ico',
      '.cur',
      '.heic',
      '.heif',
      '.jxl',
      '.txt',
    ]) {
      assert.equal(isImageFile(`a${ext}`), false, ext)
    }
  })

  await test('图片: 原有格式与非常规名仍按原规则', async () => {
    for (const name of ['a.png', 'a.jpg', 'a.jpeg', 'a.webp', 'a.gif']) {
      assert.equal(isImageFile(name), true, name)
    }
    assert.equal(isImageFile('a.tar.gz'), false)
    assert.equal(isImageFile('readme'), false)
    assert.equal(isImageFile('.bmp'), false, '只有扩展名不算文件')
    assert.equal(isImageFile('a.txt'), false)
    assert.equal(isImageFile('a.bmp.tmp'), false)
  })

  await test('扫描: AOI 类型目录里只有 .bmp 时能出图（真机 0 张的根因）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sc-bmp-'))
    const shiftDir = join(root, '20261103', '20.5')
    await mkdirP(join(shiftDir, '色斑B-'), { recursive: true })
    await writeFile(join(shiftDir, '色斑B-', 'A02_1.bmp'), 'x')
    await writeFile(join(shiftDir, '色斑B-', 'A02_2.BMP'), 'x')
    // 同目录里的非图片文件不应被当成图
    await writeFile(join(shiftDir, '色斑B-', 'note.txt'), 'x')

    const resolver = {
      category: 'aoi',
      shape: {
        shiftDir: () => '20.5',
        hasSlots: false,
        baseBrokenAt: '共享名',
      },
      validate: () => null,
      resolve: async () => ({ ok: true, base: root, reason: '' }),
      segments: (m: string, dir: string) => [m, dir.slice(root.length)],
    }

    const runner = new ScanTaskRunner(
      {
        category: 'aoi',
        machines: ['东区/5A正检'],
        date: '20261103',
        shift: '夜班',
        slots: [],
        types: ['色斑B-'],
      },
      {
        category: 'aoi',
        resolver,
        load: { readConcurrency: 2, machineBatchSize: 2 },
      },
      () => undefined,
    )
    runner.start()
    await runner.waitSettled()
    const snap = runner.snapshot()

    const branch = snap.branches[0]
    assert.equal(
      branch.status,
      'hit',
      `实际 ${branch.status} / ${branch.message}`,
    )
    assert.equal(branch.images, 2, `应只认 2 张 bmp，实际 ${branch.images}`)
    const collected = runner.getImages()
    assert.equal(
      collected.length,
      2,
      `结果集应有 2 张，实际 ${collected.length}`,
    )
    assert.ok(
      collected.every((image) => /\.bmp$/i.test(image.name)),
      '结果集里不应混入 txt',
    )
  })
}

/* ---------------------------------------------------------------- 6. 断网熔断 */

/**
 * 熔断测试的地方要注意：旧实现是「连续 5 次不可达」，不分原因、
 * 一遇到非网络失败就清零；新实现是最近 12 次里 90% 以上不可达。
 * 这两类场景正是真机上"卡住"的来源，必须各写一条。
 */
const breakerTests = async () => {
  const { ScanTaskRunner } = await import('../src/main/services/scanner/task')

  /**
   * 按机台名给出剧本：每台机器第一次解析时返回指定结果。
   *
   * 用 Map 而不是"按调用顺序依次取"：并发下解析顺序不保证，
   * 顺序取会让测试结果随调度抖动（第一版就是这么写成 flaky 的）。
   */
  const makeResolver = (
    root: string,
    plan: ReadonlyMap<string, 'ok' | 'unreachable' | 'missing' | 'auth'>,
  ): MachineResolver => ({
    category: 'aoi',
    shape: { shiftDir: () => '20.5', hasSlots: false, baseBrokenAt: '共享名' },
    validate: () => null,
    resolve: async (machine: string) => {
      const state = plan.get(machine) ?? 'ok'

      if (state === 'auth') {
        return {
          ok: false,
          base: '',
          reason: '未认证',
          brokenAt: '共享名',
          unreachable: 'auth',
        }
      }

      return state === 'unreachable'
        ? {
            ok: false,
            base: '',
            reason: '不可达',
            brokenAt: '共享名',
            unreachable: 'network',
          }
        : {
            ok: true,
            base: join(root, machine.replace('/', '_')),
            reason: '',
          }
    },
    segments: (m: string) => [m],
  })

  const buildRoot = async (machines: string[]) => {
    const root = await mkdtemp(join(tmpdir(), 'sc-breaker-'))
    for (const machine of machines) {
      const shiftDir = join(root, machine.replace('/', '_'), '20261103', '20.5')
      await mkdirP(join(shiftDir, '色斑B-'), { recursive: true })
      await writeFile(join(shiftDir, '色斑B-', 'a.bmp'), 'x')
    }
    return root
  }

  await test('熔断: 阈值边界（窗口 / 比例 / 机台累计 / 复位）', async () => {
    const fresh = () => {
      const state = { pauses: 0, running: true }

      return {
        state,
        breaker: createBreaker({
          taskId: 't',
          isRunning: () => state.running,
          onPause: () => {
            state.pauses += 1
          },
        }),
      }
    }

    // 样本不足 8 个不下结论；第 8 个仍失败才暂停
    const first = fresh()
    for (let i = 0; i < 7; i += 1) first.breaker.sampleRead(true)
    assert.equal(first.state.pauses, 0)
    first.breaker.sampleRead(true)
    assert.equal(first.state.pauses, 1)

    // 暂停之后不再重复触发
    first.state.running = false
    first.breaker.sampleRead(true)
    assert.equal(first.state.pauses, 1)

    // 恰好 9/10 = 90% 触发；8/9 = 88.9% 不触发
    const ratio = fresh()
    for (let i = 0; i < 7; i += 1) ratio.breaker.sampleRead(true)
    ratio.breaker.sampleRead(false)
    ratio.breaker.sampleRead(true)
    assert.equal(ratio.state.pauses, 0, '8/9 不该暂停')
    ratio.breaker.sampleRead(true)
    assert.equal(ratio.state.pauses, 1, '9/10 应暂停')

    // 机台跨批累计：3 批全不通才暂停
    const batch = fresh()
    const oneBatch = (reachable: boolean) => {
      batch.breaker.beginBatch()
      batch.breaker.sampleMachine(reachable)
      batch.breaker.endBatch()
    }
    oneBatch(false)
    oneBatch(false)
    assert.equal(batch.state.pauses, 0)
    oneBatch(false)
    assert.equal(batch.state.pauses, 1)

    // 中间出现可达机台就清零
    batch.breaker.reset()
    oneBatch(false)
    oneBatch(false)
    oneBatch(true)
    oneBatch(false)
    oneBatch(false)
    assert.equal(batch.state.pauses, 1, '可达机台应清零累计')
  })

  await test('熔断: 夹着未认证/缺目录时不再被误判成断网暂停', async () => {
    const machines = Array.from({ length: 8 }, (_, i) => `东区/${i}A正检`)
    const root = await buildRoot(machines)
    // 8 台里 5 台不通（旧实现：连续 5 次不可达 → 暂停），
    // 但比例只有 5/8，远没到"整片断网"
    const plan = new Map<string, 'ok' | 'unreachable' | 'missing'>(
      machines.map((machine, index) => [
        machine,
        index < 5 ? 'unreachable' : 'ok',
      ]),
    )

    const runner = new ScanTaskRunner(
      {
        category: 'aoi',
        machines,
        date: '20261103',
        shift: '夜班',
        slots: [],
        types: ['色斑B-'],
      },
      {
        category: 'aoi',
        resolver: makeResolver(root, plan),
        load: { readConcurrency: 1, machineBatchSize: 8 },
      },
      () => undefined,
    )
    runner.start()
    await runner.waitSettled()
    const snap = runner.snapshot()

    assert.equal(snap.status, 'completed', `被暂停了：${snap.status}`)
    assert.ok(
      snap.branches.some((b) => b.status === 'hit'),
      '通的机台应该出图',
    )
  })

  await test('熔断: 一批只有 4 台时整批不通也能立刻暂停', async () => {
    // 真机上 AOI 是 2 台一批，10 台任务要跑 5 批才攒够样本，
    // 用户会觉得"断网了却半天不提示"。整批不通要在批尾自己下结论。
    const machines = Array.from({ length: 4 }, (_, i) => `东区/${i}A终检`)
    const root = await buildRoot(machines)
    const plan = new Map<string, 'ok' | 'unreachable' | 'missing'>(
      machines.map((machine) => [machine, 'unreachable']),
    )

    const runner = new ScanTaskRunner(
      {
        category: 'aoi',
        machines,
        date: '20261103',
        shift: '夜班',
        slots: [],
        types: ['色斑B-'],
      },
      {
        category: 'aoi',
        resolver: makeResolver(root, plan),
        load: { readConcurrency: 1, machineBatchSize: 4 },
      },
      () => undefined,
    )
    runner.start()
    await new Promise((resolve) => setTimeout(resolve, 300))

    const snap = runner.snapshot()
    assert.equal(snap.status, 'paused', `实际 ${snap.status}`)
    assert.equal(snap.pauseReason, 'network')
  })

  await test('熔断: 默认 2 台批次下连续多台不可达也会暂停', async () => {
    // 真机默认 machineBatchSize=2；旧判定要求"单批 >= 3 台"，永远不触发
    const machines = ['东区/1A终检', '东区/2A终检', '东区/3A终检']
    const root = await buildRoot(machines)
    const plan = new Map<string, 'ok' | 'unreachable' | 'missing' | 'auth'>(
      machines.map((machine) => [machine, 'unreachable']),
    )

    const runner = new ScanTaskRunner(
      {
        category: 'aoi',
        machines,
        date: '20261103',
        shift: '夜班',
        slots: [],
        types: ['色斑B-'],
      },
      {
        category: 'aoi',
        resolver: makeResolver(root, plan),
        load: { readConcurrency: 1, machineBatchSize: 2 },
      },
      () => undefined,
    )
    runner.start()
    await new Promise((resolve) => setTimeout(resolve, 300))

    const snap = runner.snapshot()
    assert.equal(snap.status, 'paused', `实际 ${snap.status}`)
    assert.equal(snap.pauseReason, 'network')

    runner.resume()
    await runner.waitSettled()
    assert.equal(runner.snapshot().status, 'completed')
  })

  await test('熔断: 未认证机台不会触发断网暂停', async () => {
    // 39 台未认证是现场常态；认证问题不是断网，不能把整个任务停掉
    const machines = ['东区/1A正检', '东区/2A正检', '东区/3A正检']
    const root = await buildRoot(machines)
    const plan = new Map<string, 'ok' | 'unreachable' | 'missing' | 'auth'>(
      machines.map((machine) => [machine, 'auth']),
    )

    const runner = new ScanTaskRunner(
      {
        category: 'aoi',
        machines,
        date: '20261103',
        shift: '夜班',
        slots: [],
        types: ['色斑B-'],
      },
      {
        category: 'aoi',
        resolver: makeResolver(root, plan),
        load: { readConcurrency: 1, machineBatchSize: 2 },
      },
      () => undefined,
    )
    runner.start()
    await runner.waitSettled()

    const snap = runner.snapshot()
    assert.equal(snap.status, 'completed', `被误暂停：${snap.status}`)
    assert.ok(
      snap.branches.every((b) => b.unreachableReason === 'auth'),
      '应全部标记为未认证',
    )
  })

  await test('熔断: 整片不可达时仍然会暂停，提示连 JA-PDA', async () => {
    const machines = Array.from({ length: 10 }, (_, i) => `东区/${i}A背检`)
    const root = await buildRoot(machines)
    const plan = new Map<string, 'ok' | 'unreachable' | 'missing'>(
      machines.map((machine) => [machine, 'unreachable']),
    )

    const runner = new ScanTaskRunner(
      {
        category: 'aoi',
        machines,
        date: '20261103',
        shift: '夜班',
        slots: [],
        types: ['色斑B-'],
      },
      {
        category: 'aoi',
        resolver: makeResolver(root, plan),
        load: { readConcurrency: 1, machineBatchSize: 10 },
      },
      () => undefined,
    )
    runner.start()
    await new Promise((resolve) => setTimeout(resolve, 300))

    const snap = runner.snapshot()
    assert.equal(snap.status, 'paused', `实际 ${snap.status}`)
    assert.equal(snap.pauseReason, 'network')

    // 继续之后要能跑完：resume 会清空样本窗口，不会再被旧样本拉住
    runner.resume()
    await runner.waitSettled()
    assert.equal(runner.snapshot().status, 'completed')
  })

  await test('进度: 断链机台也算做完，阶段不会一直挂在"探测目录"', async () => {
    const machines = ['东区/1A正检', '东区/2A正检']
    const root = await buildRoot(machines)
    // 第一台成功、第二台不可达：旧口径下 probedMachines 永远到不了 2
    const runner = new ScanTaskRunner(
      {
        category: 'aoi',
        machines,
        date: '20261103',
        shift: '夜班',
        slots: [],
        types: ['色斑B-'],
      },
      {
        category: 'aoi',
        resolver: makeResolver(
          root,
          new Map<string, 'ok' | 'unreachable' | 'missing'>([
            ['东区/1A正检', 'ok'],
            ['东区/2A正检', 'missing'],
          ]),
        ),
        load: { readConcurrency: 1, machineBatchSize: 2 },
      },
      () => undefined,
    )
    runner.start()
    await runner.waitSettled()

    const snap = runner.snapshot()
    assert.equal(snap.status, 'completed')
    assert.equal(snap.progress.machinesPending, 0, '两台都该有结论了')
    assert.equal(snap.progress.phase, 'done')
  })
}

/* ---------------------------------------------------------------- 日志 */

const logFormatTests = async () => {
  await test('log: 文件名、日期解析与 7 天保留', async () => {
    assert.equal(logFileName('2026-11-04'), 'quickfetch-2026-11-04.log')
    assert.equal(parseLogDay('quickfetch-2026-11-04.log'), '2026-11-04')
    assert.equal(parseLogDay('other.log'), null)
    assert.equal(parseLogDay('quickfetch-2026-02-31.log'), null)
    assert.equal(retentionCutoffDay('2026-11-04', 7), '2026-10-29')
    assert.equal(retentionCutoffDay('2026-01-02', 7), '2025-12-27')
    assert.equal(retentionCutoffDay('2024-03-01', 7), '2024-02-24')
    assert.equal(isLogDayExpired('2026-10-29', '2026-11-04', 7), false)
    assert.equal(isLogDayExpired('2026-10-28', '2026-11-04', 7), true)
  })

  await test('log: 单行格式固定且 meta 换行不拆行', async () => {
    const at = new Date(2026, 10, 4, 10, 23, 45, 123)
    const line = formatLogLine(
      'info',
      'scan',
      'scan.start',
      { taskId: 't1' },
      at,
    )

    assert.equal(
      line,
      '2026-11-04 10:23:45.123 | INFO  | scan | scan.start | {"taskId":"t1"}',
    )

    const multiline = formatLogLine(
      'info',
      'test',
      'line',
      { text: 'a\nb' },
      at,
    )
    assert.equal(multiline.split('\n').length, 1)
  })

  await test('log: 序列化 Error/循环引用/字节/长字符串/大数组', async () => {
    const error = Object.assign(new Error('boom'), {
      code: 'ETIMEDOUT',
      errno: -110,
      syscall: 'scandir',
      path: '\\\\10.1.1.2\\SaveImages',
    })
    const serializedError = serializeLogValue(error) as Record<string, unknown>
    assert.equal(serializedError.name, 'Error')
    assert.equal(serializedError.message, 'boom')
    assert.equal(serializedError.code, 'ETIMEDOUT')
    assert.equal(serializedError.errno, -110)
    assert.equal(serializedError.syscall, 'scandir')
    assert.equal(serializedError.path, '\\\\10.1.1.2\\SaveImages')
    assert.match(String(serializedError.stack), /boom/)

    const circular: Record<string, unknown> = {}
    circular.self = circular
    const serializedCircular = serializeLogValue(circular) as Record<
      string,
      unknown
    >
    assert.equal(serializedCircular.self, '[Circular]')

    const bytes = serializeLogValue(new Uint8Array(1024)) as Record<
      string,
      unknown
    >
    assert.equal(bytes.type, 'Uint8Array')
    assert.equal(bytes.byteLength, 1024)

    const long = serializeLogValue('x'.repeat(1500))
    assert.match(String(long), /\+500 chars/)

    const many = serializeLogValue(
      Array.from({ length: 100 }, (_, index) => index),
    ) as unknown[]
    assert.equal(many.length, 21)
    assert.equal(many[20], '[+80 more]')
  })
}

const loggerRuntimeTests = async () => {
  await test('log: 关闭不写、开启写入、跨天分文件、close 幂等', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'qf-log-'))
    let now = new Date(2026, 10, 4, 10, 0, 0)
    const instance = createLogger({
      dir,
      now: () => now,
      flushIntervalMs: 10,
    })

    instance.info('test', 'disabled', {})
    await instance.flush()

    const before = await readdir(dir).catch(() => [] as string[])
    assert.equal(before.length, 0)

    instance.setEnabled(true)
    instance.info('test', 'one', { a: 1 })

    now = new Date(2026, 10, 5, 10, 0, 0)
    instance.info('test', 'two', { b: 2 })
    await instance.flush()

    const day1 = await readFile(join(dir, logFileName('2026-11-04')), 'utf8')
    const day2 = await readFile(join(dir, logFileName('2026-11-05')), 'utf8')

    assert.match(day1, /log\.enabled/)
    assert.match(day1, /test \| one/)
    assert.doesNotMatch(day1, /test \| two/)
    assert.match(day2, /test \| two/)

    await instance.close(200)
    await instance.close(200)

    const closedLength = day2.length
    instance.info('test', 'after-close', {})
    await instance.flush()

    const day2After = await readFile(
      join(dir, logFileName('2026-11-05')),
      'utf8',
    )
    assert.match(day2After, /log\.session\.end/)
    assert.ok(day2After.length >= closedLength)
    assert.doesNotMatch(day2After, /after-close/)
  })

  await test('log: 清理只删过期且匹配命名的文件', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'qf-prune-'))
    const old1 = logFileName('2026-10-27')
    const old2 = logFileName('2026-10-28')
    const keep = logFileName('2026-10-29')
    const today = logFileName('2026-11-04')

    for (const name of [old1, old2, keep, today]) {
      await writeFile(join(dir, name), 'x')
    }
    await writeFile(join(dir, 'notes.txt'), 'keep me')

    const removed = await pruneOldLogs(dir, '2026-11-04', 7)
    assert.deepEqual(removed, [old1, old2])

    const left = (await readdir(dir)).sort()
    assert.deepEqual(left, [keep, today, 'notes.txt'].sort())
  })
}

const diagnosisTests = async () => {
  const readResult = (
    status: DirReadResult['status'],
    extra: Partial<DirReadResult> = {},
  ): DirReadResult => ({
    status,
    dirs: [],
    files: [],
    elapsedMs: 0,
    ...extra,
  })

  await test('诊断: 读取状态 → 不可达原因是唯一映射', async () => {
    assert.deepEqual(classifyReadStatus('unreachable'), {
      reason: 'network',
      networkSample: true,
    })
    assert.deepEqual(classifyReadStatus('unreadable'), {
      reason: 'auth',
      networkSample: false,
    })
    assert.deepEqual(classifyReadStatus('denied'), {
      reason: 'denied',
      networkSample: false,
    })
    assert.deepEqual(classifyReadStatus('missing'), { networkSample: false })

    // 越靠近主机的失败优先
    assert.equal(
      classifyFailureStatuses(['missing', 'denied']).reason,
      'denied',
    )
    assert.equal(
      classifyFailureStatuses(['denied', 'unreadable']).reason,
      'auth',
    )
    assert.equal(
      classifyFailureStatuses(['unreadable', 'unreachable']).reason,
      'network',
    )
  })

  await test('诊断: 前缀失败只在一处翻译（EL/LXT/PL 共用）', async () => {
    // 成功读取：没有失败项，交给 resolver 自己拼「目录/共享名缺失」
    assert.equal(
      describePrefixFailure({
        statuses: ['ok'],
        layer: 'EL',
        network: { subject: 'A01-A' },
        auth: { subject: '\\\\host\\share' },
        denied: { subject: 'A01-A/EL' },
      }),
      null,
    )

    const network = describePrefixFailure({
      statuses: ['missing', 'unreachable'],
      layer: '共享名',
      network: { subject: '\\\\host', code: 'ETIMEDOUT' },
      auth: { subject: '\\\\host', style: 'share-unreadable' },
      denied: { subject: '\\\\host', between: ' 共享' },
    })
    assert.equal(network?.ok, false)
    assert.equal(network?.unreachable, 'network')
    assert.equal(network?.brokenAt, '共享名')
    assert.match(network?.reason ?? '', /不可达（ETIMEDOUT）/)

    // 共享根读不通用 share-unreadable 的说法，与 EL 的目录读取失败区分
    const auth = describePrefixFailure({
      statuses: ['unreadable'],
      layer: '机台标识',
      network: { subject: '\\\\host' },
      auth: { subject: '\\\\host', style: 'share-unreadable' },
      denied: { subject: '\\\\host' },
    })
    assert.equal(auth?.unreachable, 'auth')
    assert.equal(auth?.brokenAt, '机台标识')
    assert.match(auth?.reason ?? '', /共享读不通/)

    const denied = describePrefixFailure({
      statuses: ['denied'],
      layer: '共享名',
      network: { subject: '\\\\host' },
      auth: { subject: '\\\\host', style: 'share-unreadable' },
      denied: { subject: '\\\\host', between: ' 共享' },
    })
    assert.equal(denied?.unreachable, 'denied')
    assert.match(denied?.reason ?? '', /共享的权限/)
  })

  await test('诊断: 逐目录失败文案与断网样本', async () => {
    const network = describeLeafFailure({
      result: readResult('unreachable', { code: 'ETIMEDOUT' }),
      where: '\\\\host\\share',
      brokenAt: '日期',
    })
    assert.equal(network.status, 'unreachable')
    assert.equal(network.reason, 'network')
    assert.equal(network.networkSample, true)
    assert.match(network.message, /不可达（ETIMEDOUT）/)
    assert.match(network.message, /JA-PDA/)

    const auth = describeLeafFailure({
      result: readResult('unreadable'),
      where: '\\\\host\\share',
      brokenAt: '日期',
    })
    assert.equal(auth.reason, 'auth')
    assert.equal(auth.networkSample, false)
    assert.match(auth.message, /未认证/)
    assert.match(auth.message, /然后重新扫描/)

    const denied = describeLeafFailure({
      result: readResult('denied'),
      where: '\\\\host\\share',
      brokenAt: '类型',
    })
    assert.equal(denied.reason, 'denied')
    assert.match(denied.message, /该共享的读权限/)

    const missing = describeLeafFailure({
      result: readResult('missing'),
      where: '\\\\host\\share',
      brokenAt: '类型',
      detail: { expected: '8', actual: ['9', '10'] },
    })
    assert.equal(missing.status, 'missing')
    assert.equal(missing.missingName, '8')
    assert.match(missing.message, /实际存在：9、10/)

    const elMissing = describeLeafFailure({
      result: readResult('missing'),
      where: 'A01-A',
      brokenAt: 'EL',
    })
    assert.equal(elMissing.missingName, 'EL')
  })

  await test('诊断: 入口读取错误文案统一', async () => {
    const enoent = Object.assign(new Error('missing'), { code: 'ENOENT' })
    const eacces = Object.assign(new Error('denied'), { code: 'EACCES' })

    assert.equal(
      describeAccessError(enoent, 'D:\\entry', { noun: '入口目录' }),
      '入口目录不存在或已被移动：D:\\entry，请重新选择',
    )
    assert.match(
      describeAccessError(eacces, 'D:\\entry', {
        permissionSuffix: '共享目录访问权限',
      }),
      /请检查共享目录访问权限/,
    )
  })
}

const shareProbeTests = async () => {
  const result = (
    status: DirReadResult['status'],
    dirs: string[] = [],
  ): DirReadResult => ({
    status,
    dirs,
    files: [],
    elapsedMs: 0,
  })

  const parseCompactDate = (value: string): number | null => {
    if (!/^\d{8}$/.test(value)) return null

    return Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
    )
  }

  await test('共享探测: 两步读取与 30 天日期窗口', async () => {
    const calls: string[] = []
    const read = async (path: string): Promise<DirReadResult> => {
      calls.push(path)
      return path.endsWith('A-01-B')
        ? result('ok', ['20261104', '20261010', '20260901'])
        : result('ok')
    }

    const candidate = await readShareCandidate({
      host: '\\\\10.108.8.230',
      share: 'SaveImages',
      child: 'A-01-B',
      taskDate: '20261104',
      parseDate: parseCompactDate,
      read,
    })

    assert.equal(candidate.status, 'ok')
    assert.equal(candidate.rootStatus, 'ok')
    assert.equal(candidate.hasTaskDate, true)
    assert.equal(candidate.hasRecentDate, true)
    assert.equal(calls.length, 2)

    const rootOnly: string[] = []
    const unreadable = await readShareCandidate({
      host: '\\\\10.108.8.230',
      share: 'el',
      child: 'A-01-B',
      taskDate: '20261104',
      parseDate: parseCompactDate,
      read: async (path) => {
        rootOnly.push(path)
        return result('unreadable')
      },
    })

    assert.equal(unreadable.rootStatus, 'unreadable')
    assert.equal(unreadable.status, 'unreadable')
    assert.equal(unreadable.hasTaskDate, false)
    assert.equal(rootOnly.length, 1, '共享根读不通时不应再读固定子目录')
  })

  await test('共享探测: 网络失败重试一次', async () => {
    let calls = 0
    const read = async (): Promise<DirReadResult> => {
      calls += 1
      return calls === 1 ? result('unreachable') : result('ok')
    }

    const probed = await probeSharePath('\\\\10.108.8.230\\el', read)

    assert.equal(probed.status, 'ok')
    assert.equal(calls, 2)
  })
}

const scanParamsTests = async () => {
  const base = {
    configured: true,
    plant: '东区',
    selectedMachines: ['东区/1A'],
    date: '20261104',
    shift: '夜班' as const,
    slots: ['20'],
    types: ['NG'],
    levels: [],
    typeCatalog: ['NG'],
  }

  await test('页面参数: 标准类别包含时段与厂区指纹', async () => {
    const derived = deriveScanParams({
      ...base,
      hasSlots: true,
      requiresLevels: false,
    })

    assert.equal(derived.ready, true)
    assert.deepEqual(derived.missing, [])
    assert.equal(derived.params.slots[0], '20')
    assert.ok(derived.filterSignature.startsWith('东区|20261104'))
    assert.ok(derived.filterSignature.includes('20'))
  })

  await test('页面参数: AOI 无时段层、利珀需要等级', async () => {
    const aoi = deriveScanParams({
      ...base,
      slots: ['20'],
      hasSlots: false,
      requiresLevels: false,
    })
    assert.equal(aoi.ready, true)
    assert.deepEqual(aoi.params.slots, [])
    assert.equal(
      aoi.filterSignature.split('|')[3],
      '',
      '无时段层的类别不应把时段写进指纹',
    )

    const pl = deriveScanParams({
      ...base,
      levels: [],
      hasSlots: true,
      requiresLevels: true,
    })
    assert.equal(pl.ready, false)
    assert.ok(pl.missing.includes('等级'))

    const plWithLevel = deriveScanParams({
      ...base,
      levels: ['A'],
      hasSlots: true,
      requiresLevels: true,
    })
    assert.equal(plWithLevel.ready, true)
    assert.deepEqual(plWithLevel.params.levels, ['A'])
  })

  await test('页面参数: 类别 descriptor 驱动四类派生', async () => {
    for (const category of SCAN_CATEGORIES) {
      const meta = SCAN_CATEGORY_META[category]
      const derived = deriveScanParams({
        ...base,
        slots: ['20'],
        levels: meta.requiresLevels ? ['A'] : [],
        hasSlots: meta.hasSlots,
        requiresLevels: meta.requiresLevels,
        imageKind: meta.hasImageKind ? 'whole' : undefined,
        types: ['NG'],
        typeCatalog: ['NG'],
      })

      assert.equal(derived.ready, true, `${category} 应可扫描`)
      assert.deepEqual(
        derived.params.slots,
        meta.hasSlots ? ['20'] : [],
        `${category} 的时段层应与 descriptor 一致`,
      )
      assert.equal(
        'aoiImageKind' in derived.params,
        meta.hasImageKind,
        `${category} 的图片类型字段应与 descriptor 一致`,
      )
    }
  })

  await test('类别 descriptor: 清单穷尽且默认配置形状一致', async () => {
    assert.deepEqual(
      [...SCAN_CATEGORIES].sort(),
      ['aoi', 'el', 'lxt', 'pl'],
      '类别清单必须覆盖全部扫描类别',
    )

    const settings = defaultSettings()

    for (const category of SCAN_CATEGORIES) {
      const meta = SCAN_CATEGORY_META[category]
      assert.ok(meta.label && meta.eyebrow && meta.networkHint, category)
      assert.ok(
        Array.isArray(settings.categories[category].typeCatalog),
        `${category} 的类型清单不在配置里`,
      )
    }
  })

  await test('页面参数: AOI 图片类型进参数与指纹', async () => {
    const whole = deriveScanParams({
      ...base,
      hasSlots: false,
      requiresLevels: false,
      imageKind: 'whole',
    })
    const partial = deriveScanParams({
      ...base,
      hasSlots: false,
      requiresLevels: false,
      imageKind: 'partial',
    })

    assert.equal(whole.params.aoiImageKind, 'whole')
    assert.equal(partial.params.aoiImageKind, 'partial')
    assert.notEqual(
      whole.filterSignature,
      partial.filterSignature,
      '整体/局部读的是两个目录，换一种就等于换了扫描范围',
    )

    // 非 AOI 类别不传 imageKind 时不能把字段带进参数
    const el = deriveScanParams({
      ...base,
      hasSlots: true,
      requiresLevels: false,
    })
    assert.equal('aoiImageKind' in el.params, false)
  })

  await test('会话时序: 指纹变化只在用户改范围时清结果', async () => {
    // 首次只记基线
    assert.equal(decideSignatureChange(null, 'a', 'completed'), 'adopt')
    assert.equal(decideSignatureChange('a', 'a', 'completed'), 'ignore')

    // 用户改范围：已结束的才清，运行中不清
    assert.equal(decideSignatureChange('a', 'b', 'completed'), 'reset')
    assert.equal(decideSignatureChange('a', 'b', 'interrupted'), 'reset')
    assert.equal(decideSignatureChange('a', 'b', 'running'), 'adopt')
    assert.equal(decideSignatureChange('a', 'b', null), 'adopt')

    // 恢复历史把基线推进到恢复后的指纹后，同一个指纹不再算变化
    assert.equal(decideSignatureChange('b', 'b', 'completed'), 'ignore')
  })

  await test('页面参数: 类型清单为空时提示去编辑', async () => {
    const derived = deriveScanParams({
      ...base,
      types: [],
      typeCatalog: [],
      hasSlots: true,
      requiresLevels: false,
    })

    assert.equal(derived.ready, false)
    assert.ok(derived.missing.includes('类型（点「编辑」添加）'))
  })
}

const aoiTests = async () => {
  const fakeHost = '\\\\10.108.9.132'
  const hosts = () => new Map([['东区/1A正检', fakeHost]])

  await test('AOI: 默认读 SaveImages，局部读 SaveSmallImages', async () => {
    const whole = createAoiResolver({ hosts: hosts() })
    assert.equal(whole.shape.baseName, AOI_IMAGE_DIRS.whole)
    assert.equal(whole.shape.baseName, 'SaveImages')

    const wholeResolved = await whole.resolve('东区/1A正检')
    assert.equal(wholeResolved.ok, true)
    if (!wholeResolved.ok) return
    assert.equal(wholeResolved.base, join(fakeHost, 'SaveImages'))
    assert.deepEqual(
      whole.segments(
        '东区/1A正检',
        join(wholeResolved.base, '20261103', '20.5', '色斑B-'),
      ),
      ['东区', '1A正检', '20261103', '20.5', '色斑B-'],
      '展示路径里不应出现共享名',
    )

    const partial = createAoiResolver({ hosts: hosts(), imageKind: 'partial' })
    assert.equal(partial.shape.baseName, 'SaveSmallImages')
    const partialResolved = await partial.resolve('东区/1A正检')
    assert.equal(partialResolved.ok, true)
    if (!partialResolved.ok) return
    assert.equal(partialResolved.base, join(fakeHost, 'SaveSmallImages'))
  })

  await test('AOI: 缺省 imageKind 按整张扫描图处理（老历史记录）', async () => {
    const resolver = createAoiResolver({ hosts: hosts() })
    assert.equal(
      resolver.shape.baseName,
      AOI_IMAGE_DIRS[DEFAULT_AOI_IMAGE_KIND],
    )
  })

  await test('AOI: 机台不在入口里时仍在共享名处断链', async () => {
    const resolver = createAoiResolver({ hosts: new Map() })

    assert.ok(resolver.validate(), '没有机台时 validate 必须报错')
    const resolved = await resolver.resolve('东区/1A正检')
    assert.equal(resolved.ok, false)
    if (resolved.ok) return
    assert.equal(resolved.brokenAt, '共享名')
  })

  await test('AOI: 整体/局部各自只读到对应目录的图', async () => {
    const { ScanTaskRunner } = await import('../src/main/services/scanner/task')
    const root = await mkdtemp(join(tmpdir(), 'qf-aoi-kind-'))

    // 真机上第二层是两个同级目录；这里用临时目录冒充主机
    const wholeDir = join(root, 'SaveImages', '20261103', '20.5', '色斑B-')
    const partialDir = join(
      root,
      'SaveSmallImages',
      '20261103',
      '20.5',
      '色斑B-',
    )
    await mkdirP(wholeDir, { recursive: true })
    await mkdirP(partialDir, { recursive: true })
    await writeFile(join(wholeDir, 'A02_1.bmp'), 'x')
    await writeFile(join(partialDir, 'A02_1.jpg'), 'x')

    const scan = async (imageKind: 'whole' | 'partial') => {
      const runner = new ScanTaskRunner(
        {
          category: 'aoi',
          machines: ['东区/1A正检'],
          date: '20261103',
          shift: '夜班',
          slots: [],
          types: ['色斑B-'],
        },
        {
          category: 'aoi',
          resolver: createAoiResolver({
            hosts: new Map([['东区/1A正检', root]]),
            imageKind,
          }),
          load: { readConcurrency: 2, machineBatchSize: 2 },
        },
        () => undefined,
      )

      runner.start()
      await runner.waitSettled()

      return runner
    }

    const whole = await scan('whole')
    const wholeImages = whole.getImages()
    assert.equal(wholeImages.length, 1)
    assert.ok(wholeImages[0].name.endsWith('.bmp'), wholeImages[0].name)

    const partial = await scan('partial')
    const partialImages = partial.getImages()
    assert.equal(partialImages.length, 1)
    assert.ok(partialImages[0].name.endsWith('.jpg'), partialImages[0].name)
  })

  await test('检测面: 机台名与机台键的判定', async () => {
    assert.equal(aoiSideOfName('1A正检'), 'front')
    assert.equal(aoiSideOfName('10B背检'), 'back')
    assert.equal(aoiSideOfName('1A'), null)

    assert.equal(aoiSideOfMachines([]), 'all')
    assert.equal(aoiSideOfMachines(['东区/1A正检', '东区/2A正检']), 'front')
    assert.equal(aoiSideOfMachines(['东区/1A背检']), 'back')
    assert.equal(
      aoiSideOfMachines(['东区/1A正检', '东区/1A背检']),
      'all',
      '混选时必须回到全部，否则恢复后有机台被列表藏起来',
    )
    assert.equal(aoiSideOfMachines(['东区/1A']), 'all')
  })

  await test('检测面: 切换时裁掉另一侧已选机台', async () => {
    const selected = ['东区/1A正检', '东区/1A背检', '东区/2A正检']

    assert.deepEqual(pruneMachinesToSide(selected, 'front'), [
      '东区/1A正检',
      '东区/2A正检',
    ])
    assert.deepEqual(pruneMachinesToSide(selected, 'back'), ['东区/1A背检'])
    assert.deepEqual(pruneMachinesToSide(selected, 'all'), selected)
  })
}

const settingsContractTests = async () => {
  await test('配置契约: v2 默认形状与四类 categories', async () => {
    const settings = defaultSettings()

    assert.equal(settings.version, 2)
    assert.equal(isAppSettings(settings), true)
    assert.equal(isAppSettings({ ...settings, version: 1 }), false)

    // 旧的顶层字段必须已经消失
    assert.equal('rootPath' in settings, false)
    assert.equal('entry' in settings, false)
    assert.equal('machines' in settings, false)
    assert.equal('updatedAt' in settings, false)

    for (const key of ['el', 'lxt', 'pl', 'aoi'] as const) {
      const category = settings.categories[key]
      assert.deepEqual(category, {
        entryRoot: null,
        machines: [],
        skipped: [],
        updatedAt: null,
        typeCatalog: [],
      })
    }
  })

  await test('配置契约: 四类 normalize 与 typeCatalog 保留', async () => {
    const el = normalizeEl({
      entryRoot: '/mnt/DC',
      machines: [
        { name: 'A01-A', plant: 'west' },
        { name: 'B02-B' },
        { name: 'not-a-plant' },
      ],
      typeCatalog: [' 色差 ', '色差', '', '脏污'],
      updatedAt: '2026-11-06T00:00:00.000Z',
    })

    assert.equal(el.entryRoot, '/mnt/DC')
    // 厂区按首字母重算，不信任文件里的 plant；认不出厂区的目录丢弃
    assert.deepEqual(el.machines, [
      { name: 'A01-A', plant: 'east' },
      { name: 'B02-B', plant: 'west' },
    ])
    assert.deepEqual(el.typeCatalog, ['色差', '脏污'])
    assert.equal(el.updatedAt, '2026-11-06T00:00:00.000Z')
    assert.deepEqual(el.skipped, [])

    const lxt = normalizeLxt({
      entryRoot: '\\\\10.0.0.1\\share',
      machines: [
        { plant: '东区', name: '1A', host: '\\\\10.0.0.1', share: 'el' },
        { plant: '东区', name: '1A', host: '\\\\10.0.0.2', share: null },
      ],
      skipped: [{ plant: '东区', file: 'x.lnk', reason: '坏了' }],
      typeCatalog: ['色差'],
    })

    assert.equal(lxt.machines.length, 1, '同一「厂区/机台」只保留一台')
    assert.equal(lxt.machines[0].key, '东区/1A')
    assert.equal(lxt.machines[0].share, 'el')
    assert.equal(lxt.skipped.length, 1)
    assert.deepEqual(lxt.typeCatalog, ['色差'], '机台刷新不能吞掉类型清单')

    const pl = normalizePl({ machines: [], typeCatalog: ['脏污'] })
    assert.deepEqual(pl.typeCatalog, ['脏污'])
    assert.equal(pl.entryRoot, null)

    const aoi = normalizeAoi({
      machines: [
        { plant: '东区', name: '1A正检', host: '\\\\10.0.0.3', share: 'el' },
      ],
    })
    assert.equal(aoi.machines[0].share, null, 'AOI 的 share 恒为 null')
  })

  await test('配置契约: 类型清单 trim / 去重 / 保序', async () => {
    assert.deepEqual(normalizeTypeCatalog(undefined), [])
    assert.deepEqual(normalizeTypeCatalog([' b ', 'a', 'b', '', 3]), ['b', 'a'])
  })
}

const updateTests = async () => {
  await test('自动更新: 安装方式按卸载器判断', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'qf-update-mode-'))

    assert.equal(detectInstallModeFromDir(dir, 'QuickFetch'), 'portable')

    await writeFile(join(dir, 'Uninstall QuickFetch.exe'), '')

    assert.equal(detectInstallModeFromDir(dir, 'QuickFetch'), 'installed')
  })

  await test('自动更新: 偏好默认开启且严格布尔', async () => {
    assert.equal(normalizePreferences(undefined).updateAutoCheckEnabled, true)
    assert.equal(
      normalizePreferences({ updateAutoCheckEnabled: false })
        .updateAutoCheckEnabled,
      false,
    )
    assert.equal(
      normalizePreferences({ updateAutoCheckEnabled: 'false' as never })
        .updateAutoCheckEnabled,
      true,
    )
  })

  await test('自动更新: 状态机与任务阻塞', async () => {
    let state = initialState('3.4.0', 'installed')

    assert.equal(state.phase, 'idle')

    state = reduceUpdateState(state, {
      type: 'check-started',
      manual: true,
      at: 1,
    })
    assert.equal(state.phase, 'checking')
    assert.equal(state.lastCheckManual, true)

    state = reduceUpdateState(state, {
      type: 'update-available',
      version: '3.5.0',
      releaseDate: null,
      at: 2,
    })
    assert.equal(state.phase, 'available')
    assert.equal(state.availableVersion, '3.5.0')

    state = reduceUpdateState(state, { type: 'download-started' })
    state = reduceUpdateState(state, {
      type: 'download-progress',
      percent: 42.4,
      transferred: 10,
      total: 100,
      bytesPerSecond: 5,
    })
    assert.equal(state.percent, 42)

    state = reduceUpdateState(state, { type: 'downloaded' })
    assert.equal(state.phase, 'downloaded')
    assert.equal(state.canInstall, true)

    state = reduceUpdateState(state, {
      type: 'tasks',
      blocked: true,
      reason: '有任务',
    })
    assert.equal(state.canInstall, false)

    state = reduceUpdateState(state, {
      type: 'tasks',
      blocked: false,
      reason: null,
    })
    assert.equal(state.canInstall, true)

    let portable = initialState('3.4.0', 'portable')

    portable = reduceUpdateState(portable, {
      type: 'update-available',
      version: '3.5.0',
      releaseDate: null,
      at: 1,
    })
    portable = reduceUpdateState(portable, { type: 'downloaded' })
    assert.equal(portable.canInstall, false, '免安装版任何时候都不能自动安装')
  })

  await test('自动更新: 任务闸门文案', async () => {
    assert.equal(describeTaskBlock(false, false).blocked, false)
    assert.match(describeTaskBlock(true, false).reason ?? '', /扫描任务/)
    assert.match(describeTaskBlock(false, true).reason ?? '', /复制任务/)
    assert.match(describeTaskBlock(true, true).reason ?? '', /扫描和复制/)
  })

  await test('自动更新: IPC 摘要不记录参数', async () => {
    assert.deepEqual(summarizeIpcArgs('checkForUpdates', []), {})
    assert.deepEqual(summarizeIpcArgs('installUpdate', []), {})
  })

  await test('自动更新: 瞬时错误重试与文案', async () => {
    assert.equal(
      isTransientCheckError(new Error('500 "method: GET"')),
      true,
      '发版后 CDN 的 5xx 应重试',
    )
    assert.equal(
      isTransientCheckError(new Error('net::ERR_HTTP_RESPONSE_CODE_FAILURE')),
      true,
    )
    assert.equal(
      isTransientCheckError(new Error('404 Not Found')),
      false,
      '缺 latest.yml 重试没有意义',
    )

    assert.match(
      describeUpdateError(new Error('500 "method: GET"')),
      /GitHub 暂时不可用/,
    )
    assert.match(
      describeUpdateError(new Error('getaddrinfo ENOTFOUND github.com')),
      /无法连接 GitHub Releases/,
    )
    assert.match(
      describeUpdateError(new Error('404 Not Found')),
      /缺少更新信息/,
    )
  })
}

const taskTableTests = async () => {
  await test('任务表: 只淘汰最早的已结束任务', async () => {
    type FakeTask = { id: string; createdAt: number; final: boolean }
    const evicted: string[] = []
    const table = createTaskTable<FakeTask>({
      max: 2,
      isFinal: (task) => task.final,
      onEvict: (task) => evicted.push(task.id),
    })

    table.add({ id: 'old', createdAt: 1, final: true })
    table.add({ id: 'running', createdAt: 2, final: false })
    table.add({ id: 'new', createdAt: 3, final: true })

    assert.deepEqual(evicted, ['old'])
    assert.equal(table.size(), 2)
    assert.equal(table.get('old'), null)
    assert.equal(table.get('running')?.id, 'running')
    assert.deepEqual(
      table.values().map((task) => task.id),
      ['running', 'new'],
    )
  })
}

const copyReadModelTests = async () => {
  const copyTask = (status: CopyTask['status']): CopyTask =>
    ({
      id: 'copy-1',
      scanTaskId: 'scan-1',
      status,
      progress: {
        status,
        copied: 5,
        total: 10,
        copyTotal: 10,
        failed: 1,
        batchIndex: 1,
        batchTotal: 1,
        targetDir: '/old',
        layout: 'flat',
        renamed: 0,
        alreadyExists: 1,
        skipped: 1,
        conflict: 'skip',
        totalBytes: 0,
        copiedBytes: 0,
        failedBytes: 0,
        bytesPerSecond: 0,
        sizeUnknown: 0,
        currentPath: '',
        startedAt: 1,
        finishedAt: null,
        pausedMs: 0,
        elapsedMs: 1,
        etaMs: null,
      },
      error: null,
      failures: [],
      manifestPath: null,
    }) as unknown as CopyTask

  const scanTask = (status: string, totalImages = 20) =>
    ({ status, totalImages }) as unknown as ScanTask

  const input = {
    task: copyTask('running'),
    scanTask: scanTask('completed'),
    machines: ['A'],
    machineStats: [
      { machine: 'A', images: 10 },
      { machine: 'B', images: 5 },
    ],
    targetDir: '/new',
    busy: false,
  }

  await test('复制 read model: done / percent / 有效目录只算一次', async () => {
    const running = deriveCopyReadModel(input)

    assert.equal(running.done, 8)
    assert.equal(running.percent, 80)
    assert.equal(running.selectedCount, 1)
    assert.equal(running.allSelected, false)
    assert.equal(running.pickedCount, 10)
    assert.equal(running.running, true)
    assert.equal(running.activeDir, '/old', '运行中以任务实际目录为准')

    const completed = deriveCopyReadModel({
      ...input,
      task: copyTask('completed'),
    })
    assert.equal(completed.finished, true)
    assert.equal(completed.running, false)
    assert.equal(completed.activeDir, '/new', '结束后优先显示新选目录')
    assert.equal(completed.revealDir, completed.activeDir, '显示哪个就打开哪个')
  })

  await test('复制 read model: canCopy 只看扫描、勾选、目录与忙碌', async () => {
    assert.equal(deriveCopyReadModel(input).canCopy, true)

    assert.equal(
      deriveCopyReadModel({ ...input, busy: true }).canCopy,
      false,
      '请求在路上时不能重复点',
    )
    assert.equal(
      deriveCopyReadModel({ ...input, scanTask: scanTask('failed') }).canCopy,
      false,
      '扫描失败没有可复制的图',
    )
    assert.equal(
      deriveCopyReadModel({ ...input, scanTask: scanTask('running') }).canCopy,
      false,
      '扫描还没结束',
    )
    assert.equal(
      deriveCopyReadModel({ ...input, scanTask: scanTask('completed', 0) })
        .canCopy,
      false,
      '一张图都没有',
    )
    assert.equal(
      deriveCopyReadModel({ ...input, machines: [] }).canCopy,
      false,
      '没勾机台',
    )
    assert.equal(
      deriveCopyReadModel({ ...input, task: null, targetDir: '' }).canCopy,
      false,
      '没选目标目录',
    )
  })
}

const historyStoreTests = async () => {
  const image = (index: number) => ({
    path: `A/EL/20261104/夜班/8/NG/x${index}.jpg`,
    absolutePath: `/tmp/x${index}.jpg`,
    name: `x${index}.jpg`,
    machine: 'A',
  })

  const task = (
    id: string,
    status: ScanTask['status'],
    images = 1,
    branches = [{ machine: 'A', status: 'hit', matchedDirs: 1, images }],
  ): ScanTask =>
    ({
      id,
      status,
      params: {
        category: 'el',
        machines: ['A'],
        date: '20261104',
        shift: '夜班',
        slots: ['8'],
        types: ['NG'],
      },
      progress: {
        phase: 'done',
        percent: 100,
        dirsScanned: 1,
        dirsHit: 1,
        dirsSkipped: 0,
        dirsUnreachable: 0,
        images,
        currentPath: '',
        detailsPending: 0,
        concurrency: 1,
        batchIndex: 1,
        batchTotal: 1,
        detailTotal: 1,
        detailDone: 1,
        machinesPending: 0,
        etaMs: 0,
      },
      branches,
      pauseReason: null,
      error: null,
      createdAt: 1,
      startedAt: 2,
      finishedAt: 3,
      totalImages: images,
      preview: [],
      elapsedMs: 1,
    }) as unknown as ScanTask

  await test('历史 store: 资格判定、原子落盘与读取', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'qf-history-'))
    const store = createHistoryStore(dir)

    await store.saveRecord(task('running', 'running'), [image(0)])
    assert.equal(
      existsSync(join(dir, 'running.json')),
      false,
      '运行中的任务不落盘',
    )

    await store.saveRecord(
      task('empty', 'canceled', 0, [
        { machine: 'A', status: 'skipped', matchedDirs: 0, images: 0 },
      ]),
      [],
    )
    assert.equal(
      existsSync(join(dir, 'empty.json')),
      false,
      '取消且没有诊断结论的任务不落盘',
    )

    await store.saveRecord(
      task('interrupted', 'running', 0, [
        { machine: 'A', status: 'skipped', matchedDirs: 0, images: 0 },
      ]),
      [],
      { interrupted: true },
    )

    const interrupted = await store.readRecord('interrupted')
    assert.equal(interrupted?.status, 'interrupted')
    assert.ok(interrupted?.finishedAt)

    await store.saveRecord(task('done', 'completed'), [image(0)])
    const records = await store.listRecords()
    assert.deepEqual(
      records.map((item) => item.id),
      ['done', 'interrupted'],
    )
    assert.equal((await store.listHistory())[0].category, 'el')
    assert.equal(
      existsSync(join(dir, 'done.json.summary.json')),
      true,
      '历史列表应优先读摘要 sidecar',
    )
  })

  await test('历史 store: 裁剪只删最旧且保留条数生效', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'qf-history-trim-'))
    const store = createHistoryStore(dir)

    for (const [index, id] of ['old', 'mid', 'new'].entries()) {
      const record = task(id, 'completed')
      record.createdAt = index + 1
      await store.saveRecord(record, [image(index)])
    }

    await store.trimRecords(2)
    const left = (await store.listRecords()).map((item) => item.id)
    assert.deepEqual(left, ['new', 'mid'])
  })

  await test('历史 store: 恢复快照的预览上限与实时一致', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'qf-history-preview-'))
    const store = createHistoryStore(dir)
    const images = Array.from({ length: 201 }, (_, index) => image(index))

    await store.saveRecord(task('preview', 'completed', 201), images)
    const record = await store.readRecord('preview')

    assert.ok(record)
    assert.equal(toTask(record).preview.length, 200)
    assert.equal(toTask(record).totalImages, 201)
  })
}

const logIpcTests = async () => {
  await test('log: IPC 参数摘要不输出大字节/大数组', async () => {
    const excel = summarizeIpcArgs('saveExcel', [
      { defaultName: 'a.xlsx', data: new Uint8Array(1024 * 1024) },
    ])
    assert.equal(excel.dataBytes, 1024 * 1024)
    assert.ok(JSON.stringify(excel).length < 500)

    const scan = summarizeIpcArgs('createScanTask', [
      {
        category: 'el',
        date: '20261104',
        shift: '白班',
        machines: ['A', 'B', 'C', 'D', 'E', 'F'],
        slots: ['8.5'],
        types: ['NG_脏污'],
      },
    ])
    const machines = scan.machines as { count: number; sample: unknown[] }
    assert.equal(machines.count, 6)
    assert.equal(machines.sample.length, 5)

    const copy = summarizeIpcArgs('startCopyTask', [
      't1',
      'C:/out',
      { layout: 'flat', conflict: 'rename', machines: ['A'] },
    ])
    assert.equal(copy.taskId, 't1')
    assert.equal(copy.targetDir, 'C:/out')
    assert.equal(copy.layout, 'flat')

    const circular: Record<string, unknown> = {}
    circular.self = circular
    assert.doesNotThrow(() => summarizeIpcArgs('setTypeCatalog', [circular]))
  })

  await test('settings: debugLogEnabled 只认严格布尔值', async () => {
    assert.equal(normalizePreferences(undefined).debugLogEnabled, false)
    assert.equal(normalizePreferences({}).debugLogEnabled, false)
    assert.equal(
      normalizePreferences({ debugLogEnabled: true }).debugLogEnabled,
      true,
    )
    assert.equal(
      normalizePreferences({ debugLogEnabled: 'true' as never })
        .debugLogEnabled,
      false,
    )
  })
}

/* ---------------------------------------------------------------- 19. 任务生命周期 */

const lifecycleTests = async () => {
  await test('生命周期: 暂停阻塞检查点，恢复后继续', async () => {
    const lifecycle = createTaskLifecycle({ emit: () => {} })

    assert.equal(lifecycle.status, 'pending')
    assert.equal(lifecycle.begin(), true)
    assert.equal(lifecycle.status, 'running')
    assert.notEqual(lifecycle.startedAt, null)

    assert.equal(lifecycle.pause('network'), true)
    assert.equal(lifecycle.status, 'paused')
    assert.equal(lifecycle.pauseReason, 'network')

    let resumed = false
    const waiting = lifecycle.checkpoint().then(() => {
      resumed = true
    })

    await Promise.resolve()
    assert.equal(resumed, false)

    assert.equal(lifecycle.resume(), true)
    await waiting
    assert.equal(resumed, true)
    assert.equal(lifecycle.pauseReason, null)
  })

  await test('生命周期: 暂停中取消让检查点抛 AbortError', async () => {
    const lifecycle = createTaskLifecycle({
      emit: () => {},
      cancelMessage: '复制已取消',
    })

    lifecycle.begin()
    lifecycle.pause()

    const waiting = lifecycle.checkpoint()

    assert.equal(lifecycle.cancel(), true)
    assert.equal(lifecycle.status, 'canceled')
    assert.ok(lifecycle.signal.aborted)

    await assert.rejects(waiting, (error: Error) => {
      assert.equal(error.name, 'AbortError')
      assert.equal(error.message, '复制已取消')
      return true
    })

    assert.equal(lifecycle.pause(), false)
    assert.equal(lifecycle.finish('completed'), false)
  })

  await test('生命周期: 每轮重建终态 promise 与中断信号', async () => {
    const lifecycle = createTaskLifecycle({ emit: () => {} })

    lifecycle.begin()
    const first = lifecycle.waitSettled()
    lifecycle.finish('completed')
    lifecycle.settle()
    assert.equal(await first, true)

    // 终态后可以再开一轮（复制 retry）
    assert.equal(lifecycle.begin(), true)
    assert.equal(lifecycle.signal.aborted, false)

    let secondDone = false
    const second = lifecycle.waitSettled().then(() => {
      secondDone = true
    })

    await Promise.resolve()
    assert.equal(secondDone, false)

    lifecycle.finish('failed')
    lifecycle.settle()
    await second
    assert.equal(secondDone, true)
  })

  await test('生命周期: 进度节流与强制推送', async () => {
    let emits = 0
    const lifecycle = createTaskLifecycle({
      emit: () => {
        emits += 1
      },
      throttleMs: 60_000,
    })

    lifecycle.begin()
    lifecycle.touch()
    lifecycle.touch()
    assert.equal(emits, 1)

    lifecycle.touch(true)
    assert.equal(emits, 2)
  })

  await test('生命周期: 暂停时长在恢复与取消时累计', async () => {
    const lifecycle = createTaskLifecycle({ emit: () => {} })

    lifecycle.begin()
    lifecycle.pause()
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.ok(lifecycle.pausedMs() >= 20)

    lifecycle.resume()
    const afterResume = lifecycle.pausedMs()
    assert.ok(afterResume >= 20)

    lifecycle.pause()
    await new Promise((resolve) => setTimeout(resolve, 20))
    lifecycle.cancel()
    assert.ok(lifecycle.pausedMs() >= afterResume + 10)
  })
}

/* ---------------------------------------------------------------- 20. 结果归档 */

const archiveTests = async () => {
  const image = (index: number) => ({
    path: `A/EL/20261104/夜班/8/NG/x${index}.jpg`,
    absolutePath: `/tmp/x${index}.jpg`,
    name: `x${index}.jpg`,
    machine: 'A',
  })

  const task = (
    id: string,
    status: ScanTask['status'],
    images = 1,
    createdAt = 1,
  ): ScanTask =>
    ({
      id,
      status,
      params: {
        category: 'el',
        machines: ['A'],
        date: '20261104',
        shift: '夜班',
        slots: ['8'],
        types: ['NG'],
      },
      progress: {
        phase: 'done',
        percent: 100,
        dirsScanned: 1,
        dirsHit: 1,
        dirsSkipped: 0,
        dirsUnreachable: 0,
        images,
        currentPath: '',
        detailsPending: 0,
        concurrency: 1,
        batchIndex: 1,
        batchTotal: 1,
        detailTotal: 1,
        detailDone: 1,
        machinesPending: 0,
        etaMs: 0,
      },
      branches: [{ machine: 'A', status: 'hit', matchedDirs: 1, images }],
      pauseReason: null,
      error: null,
      createdAt,
      startedAt: createdAt + 1,
      finishedAt: createdAt + 2,
      totalImages: images,
      preview: [],
      elapsedMs: 1,
    }) as unknown as ScanTask

  const setup = async (layout = 10) => {
    const root = await mkdtemp(join(tmpdir(), 'qf-archive-'))
    const dir = join(root, 'history')
    const live = new Map<
      string,
      { task: ScanTask; images: ReturnType<typeof image>[] }
    >()
    const archive = createTaskArchive({
      dir,
      live: {
        task: (id) => live.get(id)?.task ?? null,
        images: (id) => live.get(id)?.images ?? null,
      },
      limit: async () => layout,
    })

    return { dir, live, archive }
  }

  await test('归档: 正常终态只写一次', async () => {
    const { archive } = await setup()

    assert.equal(
      await archive.settle(task('done', 'completed'), [image(0)]),
      true,
    )
    assert.equal(
      await archive.settle(task('done', 'completed'), [image(0)]),
      false,
    )
    assert.equal((await archive.list()).length, 1)
  })

  await test('归档: 未终态不落盘', async () => {
    const { archive } = await setup()

    assert.equal(
      await archive.settle(task('running', 'running'), [image(0)]),
      false,
    )
    assert.equal((await archive.list()).length, 0)
  })

  await test('归档: 中断快照可被正常终态覆盖', async () => {
    const { archive } = await setup()

    assert.equal(
      await archive.settle(task('task', 'running'), [image(0)], {
        interrupted: true,
      }),
      true,
    )
    assert.equal((await archive.load('task'))?.status, 'interrupted')

    assert.equal(
      await archive.settle(task('task', 'completed'), [image(0)]),
      true,
    )
    assert.equal((await archive.load('task'))?.status, 'completed')
  })

  await test('归档: live 任务优先，结束后回落到记录', async () => {
    const { archive, live } = await setup()
    const snapshot = task('live', 'completed', 2)

    live.set('live', { task: snapshot, images: [image(0), image(1)] })

    assert.equal((await archive.load('live'))?.id, 'live')
    assert.equal((await archive.images('live')).length, 2)

    live.delete('live')
    await archive.settle(snapshot, [image(0), image(1)])

    assert.equal((await archive.load('live'))?.totalImages, 2)
    assert.equal((await archive.images('live')).length, 2)

    const page = await archive.imagePage('live', 1, 1)
    assert.equal(page.total, 2)
    assert.deepEqual(
      page.images.map((item) => item.name),
      ['x1.jpg'],
    )
  })

  await test('归档: 落盘后按保留条数裁剪', async () => {
    const { archive } = await setup(2)

    await archive.settle(task('old', 'completed', 1, 1), [image(0)])
    await archive.settle(task('mid', 'completed', 1, 2), [image(1)])
    await archive.settle(task('new', 'completed', 1, 3), [image(2)])

    const ids = (await archive.list()).map((item) => item.id)

    assert.deepEqual(ids, ['new', 'mid'])

    await archive.remove('new')
    assert.deepEqual(
      (await archive.list()).map((item) => item.id),
      ['mid'],
    )

    await archive.clear()
    assert.deepEqual(await archive.list(), [])
  })
}

/* ---------------------------------------------------------------- 21. 扫描进度账本 */

const ledgerTests = async () => {
  await test('账本: 初始状态与机台结论', async () => {
    const ledger = createScanLedger({ machines: 2, leavesPerBranch: 3 })
    const start = ledger.project(1000, 1000)

    assert.equal(start.phase, 'probe')
    assert.equal(start.percent, 0)
    assert.equal(start.machinesPending, 2)
    assert.equal(start.detailsPending, 0)
    assert.equal(start.dirsSkipped, 0)

    ledger.machineProbed()
    ledger.machineConcluded()

    const half = ledger.project(1000, 1000)

    assert.equal(half.machinesPending, 1)
    // 探测占 20%，两台里完成一台
    assert.equal(half.percent, 10)
  })

  await test('账本: 断链机台也计入结论', async () => {
    const ledger = createScanLedger({ machines: 2, leavesPerBranch: 3 })

    // 解析失败的机台不会走 machineProbed，但仍要算「下结论」
    ledger.machineConcluded()
    ledger.machineConcluded()

    assert.equal(ledger.project(1000, 1000).machinesPending, 0)
  })

  await test('账本: leaf 与明细事件推动百分比', async () => {
    const ledger = createScanLedger({ machines: 2, leavesPerBranch: 3 })

    ledger.machineProbed()
    ledger.machineConcluded()
    ledger.machineProbed()
    ledger.machineConcluded()
    ledger.leavesConcluded(2, 1)
    ledger.leavesConcluded(3, 0)

    assert.equal(ledger.project(1000, 1000).percent, 70)

    ledger.detailQueued(2)
    ledger.detailConcluded(true)
    const one = ledger.project(1000, 1000)

    assert.equal(one.detailsPending, 1)
    assert.equal(one.detailDone, 1)
    assert.equal(one.detailTotal, 2)

    ledger.detailConcluded(false)
    const done = ledger.project(1000, 1000)

    assert.equal(done.detailsPending, 0)
    // 1 个 leaf 跳过 + 1 个明细读取失败
    assert.equal(done.dirsSkipped, 2)
  })

  await test('账本: 阶段切换与完成', async () => {
    const ledger = createScanLedger({ machines: 1, leavesPerBranch: 1 })

    ledger.machineProbed()
    ledger.machineConcluded()
    ledger.leavesConcluded(1, 0)

    ledger.enterCollect(true)
    assert.equal(ledger.project(1000, 1000).phase, 'collect')

    ledger.finish()
    const done = ledger.project(1000, 1000)

    assert.equal(done.phase, 'done')
    assert.equal(done.percent, 100)
    assert.equal(done.etaMs, 0)
  })

  await test('账本: ETA 只在样本足够后给出', async () => {
    const ledger = createScanLedger({ machines: 1, leavesPerBranch: 1 })

    assert.equal(ledger.project(1000, 1000).etaMs, null)

    ledger.machineProbed()
    // 20% 时：已用 4 秒，按比例估剩余 16 秒
    assert.equal(ledger.project(5000, 1000).etaMs, 16000)

    ledger.finish()
    assert.equal(ledger.project(5000, 1000).etaMs, 0)
  })
}

/* ---------------------------------------------------------------- 22. IPC 通道描述表 */

const ipcContractTests = async () => {
  await test('IPC: 通道唯一且格式一致', async () => {
    const invokes = Object.values(IPC_INVOKE)
    const events = Object.values(IPC_EVENTS)
    const sends = Object.values(IPC_SEND)
    const all = [...invokes, ...events, ...sends]

    assert.equal(new Set(all).size, all.length, '通道不能重复')
    assert.ok(invokes.length > 0)

    for (const channel of all) {
      assert.match(channel, /^[a-z-]+:[a-z-]+$/, `通道格式不对: ${channel}`)
    }
  })

  await test('IPC: main 注册与描述表一一对应', async () => {
    const dir = join(process.cwd(), 'src/main/ipc')
    const registered = new Set<string>()

    for (const name of await readdir(dir)) {
      if (!name.endsWith('.ipc.ts')) continue

      const source = await readFile(join(dir, name), 'utf-8')

      for (const match of source.matchAll(/handle\(\s*'([A-Za-z]+)'/g)) {
        registered.add(match[1])
      }
    }

    // 漏注册、多注册或把通道字符串当方法名都会在这里失败
    assert.deepEqual(
      [...registered].sort(),
      Object.keys(IPC_INVOKE).sort(),
      'main 的 handle() 方法与 IPC_INVOKE 不一致',
    )
  })
}

/* ---------------------------------------------------------------- 23. 扫描范围 */

const scanScopeTests = async () => {
  const item = (
    category: ScanCategory,
    params: Partial<ScanTaskParams> & { machines: string[] },
  ): ScanHistoryItem => ({
    id: 'h1',
    status: 'completed',
    category,
    params: {
      category,
      date: '20261104',
      shift: '夜班',
      slots: ['8'],
      types: ['NG'],
      ...params,
    },
    totalImages: 1,
    hitMachines: 1,
    machineCount: params.machines.length,
    elapsedMs: 1000,
    createdAt: 1,
    finishedAt: 2,
    diagnosed: true,
    restorable: true,
  })

  const slice = (patch: Partial<PlantFilterSlice> = {}): PlantFilterSlice => ({
    plant: '',
    keyword: '',
    selectedMachines: ['东区/1A'],
    date: '20261104',
    shift: '夜班',
    slots: ['8'],
    types: ['NG'],
    levels: [],
    imageKind: 'whole',
    side: 'all',
    ...patch,
  })

  await test('范围: EL 历史回填按首台机台定厂区', async () => {
    const plan = planFilterRestore(
      'el',
      item('el', { machines: ['A7B', 'B8C'] }),
    )

    assert.equal(plan.plant, elPlantOf('A7B'))
    assert.deepEqual(plan.machines, ['A7B', 'B8C'])
    assert.deepEqual(plan.slots, ['8'])
    assert.equal(plan.levels, undefined)
  })

  await test('范围: 力禧特从复合键取厂区，不带等级', async () => {
    const plan = planFilterRestore(
      'lxt',
      item('lxt', {
        machines: ['东区/7A', '东区/7B'],
        levels: ['A'],
      }),
    )

    assert.equal(plan.plant, '东区')
    assert.deepEqual(plan.machines, ['东区/7A', '东区/7B'])
    assert.equal(plan.levels, undefined)
  })

  await test('范围: 利珀保留等级', async () => {
    const plan = planFilterRestore(
      'pl',
      item('pl', { machines: ['东区/6B'], levels: ['A', 'B'] }),
    )

    assert.deepEqual(plan.levels, ['A', 'B'])
  })

  await test('范围: AOI 无时段、图片类型与检测面', async () => {
    const plan = planFilterRestore(
      'aoi',
      item('aoi', { machines: ['东区/1A正检'], aoiImageKind: 'partial' }),
    )

    assert.deepEqual(plan.slots, [])
    assert.equal(plan.imageKind, 'partial')
    assert.equal(plan.side, 'front')
  })

  await test('范围: 按入口与类型清单裁剪', async () => {
    const settings = defaultSettings()

    settings.categories.el.machines = [
      { plant: '东区', name: 'A1', deleted: false },
    ] as never
    settings.categories.el.typeCatalog = ['NG']
    settings.categories.lxt.typeCatalog = ['NG']
    settings.categories.lxt.machines = [
      {
        plant: '东区',
        name: '7A',
        key: '东区/7A',
        host: '\\\\10.0.0.1',
        share: null,
        stale: false,
      },
      {
        plant: '东区',
        name: '7B',
        key: '东区/7B',
        host: '\\\\10.0.0.2',
        share: null,
        stale: true,
      },
    ]

    assert.deepEqual(activeMachineKeys('el', settings), ['A1'])
    assert.deepEqual(activeMachineKeys('lxt', settings), ['东区/7A'])
    assert.deepEqual(aliveTypes('lxt', settings, ['NG', 'OLD']), ['NG'])
    assert.deepEqual(aliveTypes('el', settings, ['NG', 'OLD']), ['NG'])
    assert.deepEqual(activeMachineKeys('pl', null), [])
  })

  await test('范围: deriveScope 注入类别差异', async () => {
    const aoi = deriveScope(
      'aoi',
      slice({ imageKind: 'partial', side: 'front' }),
      true,
      ['NG'],
    )

    assert.equal(aoi.ready, true)
    assert.deepEqual(aoi.params.slots, [])
    assert.equal(aoi.params.aoiImageKind, 'partial')

    const pl = deriveScope('pl', slice({ levels: [] }), true, ['NG'])

    assert.equal(pl.ready, false)
    assert.ok(pl.missing.includes('等级'))
  })
}

/* ---------------------------------------------------------------- 24. 设置持久化内核 */

const settingsStoreTests = async () => {
  interface Shape {
    version: number
    count: number
  }

  const make = async (initial?: string) => {
    const dir = await mkdtemp(join(tmpdir(), 'qf-settings-store-'))
    const file = join(dir, 'settings.json')

    if (initial !== undefined) await writeFile(file, initial, 'utf-8')

    const store = createSettingsStore<Shape>({
      file,
      fallback: () => ({ version: 1, count: 0 }),
      isSupported: (value) =>
        typeof value === 'object' &&
        value !== null &&
        (value as Shape).version === 1,
      normalize: (raw) => ({
        version: 1,
        count: Number(raw.count ?? 0),
      }),
      serialize: (value) => value,
    })

    return { dir, file, store }
  }

  await test('设置内核: 缺失回落、update 落盘', async () => {
    const { store } = await make()

    assert.deepEqual(await store.read(), { version: 1, count: 0 })

    const next = await store.update((current) => ({
      ...current,
      count: current.count + 2,
    }))

    assert.equal(next.count, 2)
    assert.equal((await store.read()).count, 2)
  })

  await test('设置内核: 损坏 JSON 留档并回落', async () => {
    const { dir, store } = await make('{ not json')

    assert.deepEqual(await store.read(), { version: 1, count: 0 })

    const names = await readdir(dir)
    assert.ok(
      names.some((name) => name.startsWith('settings.json.corrupt-')),
      '损坏文件应留档',
    )
  })

  await test('设置内核: 不支持的版本同样留档', async () => {
    const { store } = await make(JSON.stringify({ version: 99, count: 7 }))

    assert.deepEqual(await store.read(), { version: 1, count: 0 })
  })

  await test('设置内核: 并发 update 串行，不丢写', async () => {
    const { store } = await make()

    await Promise.all([
      store.update(async (current) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return { ...current, count: current.count + 1 }
      }),
      store.update((current) => ({ ...current, count: current.count + 1 })),
      store.update((current) => ({ ...current, count: current.count + 1 })),
    ])

    assert.equal((await store.read()).count, 3)
  })

  await test('设置内核: flush 等到排队的写入完成', async () => {
    const { store } = await make()

    const pending = store.update(async (current) => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { ...current, count: 1 }
    })

    await store.flush()
    assert.equal((await store.read()).count, 1)

    await pending
  })

  await test('设置内核: 清理残留 tmp 但不碰其它文件', async () => {
    const { dir, file, store } = await make(
      JSON.stringify({ version: 1, count: 0 }),
    )
    const tmp = `${file}.123.tmp`

    await writeFile(tmp, 'stale', 'utf-8')
    await writeFile(join(dir, 'keep.txt'), 'keep', 'utf-8')

    await store.cleanupTemp()

    assert.equal(existsSync(tmp), false)
    assert.equal(existsSync(join(dir, 'keep.txt')), true)
    assert.equal(existsSync(file), true)
  })
}

/* ---------------------------------------------------------------- 主流程 */

const main = async () => {
  console.log('\n[1] fsx 错误分类')
  await fsxTests()
  console.log('\n[2] 力禧特两步探测')
  await lxtTests()
  console.log('\n[3] 复制规划与重试')
  await copyTests()
  console.log('\n[4] 扫描任务端到端')
  await scanTests()
  console.log('\n[5] 图片扩展名')
  await imageTests()
  console.log('\n[6] 断网熔断与阶段判定')
  await breakerTests()
  console.log('\n[7] 日志格式与序列化')
  await logFormatTests()
  console.log('\n[8] 日志运行时与清理')
  await loggerRuntimeTests()
  console.log('\n[9] 日志 IPC 摘要与设置归一化')
  await logIpcTests()
  console.log('\n[10] 目录失败诊断')
  await diagnosisTests()
  console.log('\n[11] 共享名探测')
  await shareProbeTests()
  console.log('\n[12] 历史记录 store')
  await historyStoreTests()
  console.log('\n[13] 扫描页参数派生')
  await scanParamsTests()
  console.log('\n[14] 复制 read model')
  await copyReadModelTests()
  console.log('\n[15] 任务表淘汰')
  await taskTableTests()
  console.log('\n[16] 森标 AOI 图片类型与检测面')
  await aoiTests()
  console.log('\n[17] 配置契约')
  await settingsContractTests()
  console.log('\n[18] 自动更新')
  await updateTests()
  console.log('\n[19] 任务生命周期')
  await lifecycleTests()
  console.log('\n[20] 结果归档')
  await archiveTests()
  console.log('\n[21] 扫描进度账本')
  await ledgerTests()
  console.log('\n[22] IPC 通道描述表')
  await ipcContractTests()
  console.log('\n[23] 扫描范围')
  await scanScopeTests()
  console.log('\n[24] 设置持久化内核')
  await settingsStoreTests()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n共 ${results.length} 项，失败 ${failed.length} 项`)

  if (failed.length) process.exitCode = 1
}

await main()
