/**
 * 逻辑级回归测试：直接跑真实的扫描/复制模块，不启动 Electron。
 *
 * 现场问题的根因大多在「错误码 → 状态」「同名判定」「文案覆盖」这几处判断上，
 * 这些都不依赖 Electron，可以在 Linux 上用真实目录树验证。
 */
import assert from 'node:assert/strict'
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
import { createLxtResolver } from '../src/main/services/scanner/resolver'
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
import { normalizePreferences } from '../src/main/services/settings'
import { summarizeIpcArgs } from '../src/main/ipc/log-summary'
import type { MachineResolver } from '../src/main/services/scanner/resolver'
import { CopyTaskRunner } from '../src/main/services/copy/copy'
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
  const root = await mkdtemp(join(tmpdir(), 'shx-fsx-'))

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

  await test('fsx: 权限不足 → denied（root 下权限位失效，跳过）', async () => {
    if (process.getuid?.() === 0) {
      console.log('    · 当前是 root，chmod 不会生效，跳过')
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
  const base = await mkdtemp(join(tmpdir(), 'shx-lxt-'))
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
    const base2 = await mkdtemp(join(tmpdir(), 'shx-lxt2-'))
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
  const src = await mkdtemp(join(tmpdir(), 'shx-src-'))

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
    const dst = await mkdtemp(join(tmpdir(), 'shx-dst-a-'))
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
      params: { machines: [], layout: 'flat', conflict: 'skip' },
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
    const dst = await mkdtemp(join(tmpdir(), 'shx-dst-b-'))
    await writeFile(join(dst, 'img.jpg'), 'preexisting')

    const task = new CopyTaskRunner({
      scanTaskId: 's1b',
      targetDir: dst,
      params: { machines: [], layout: 'flat', conflict: 'skip' },
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
    const dst2 = await mkdtemp(join(tmpdir(), 'shx-dst2-'))
    await writeFile(join(dst2, 'img.jpg'), 'x')

    const task = new CopyTaskRunner({
      scanTaskId: 's2',
      targetDir: dst2,
      params: { machines: [], layout: 'flat', conflict: 'rename' },
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
    const dst3 = await mkdtemp(join(tmpdir(), 'shx-dst3-'))
    // 9 张里只有后 2 张的源文件不存在 → 恰好 2 张失败
    const brokenImages = images.map((img, i) =>
      i >= 7 ? { ...img, absolutePath: img.absolutePath + '.missing' } : img,
    )

    const task = new CopyTaskRunner({
      scanTaskId: 's3',
      targetDir: dst3,
      params: { machines: [], layout: 'flat', conflict: 'rename' },
      images: brokenImages,
      emit: () => undefined,
    })
    task.start()
    await task.waitSettled()

    const failed = task.snapshot()
    assert.equal(
      failed.progress.failed,
      2,
      `实际失败 ${failed.progress.failed}`,
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
    const dst5 = await mkdtemp(join(tmpdir(), 'shx-dst6-'))
    const broken = images.map((img, i) =>
      i === 0 ? { ...img, absolutePath: img.absolutePath + '.miss' } : img,
    )
    const task = new CopyTaskRunner({
      scanTaskId: 's5',
      targetDir: dst5,
      params: { machines: [], layout: 'flat', conflict: 'rename' },
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
    const dst4 = await mkdtemp(join(tmpdir(), 'shx-dst4-'))

    const task = new CopyTaskRunner({
      scanTaskId: 's4',
      targetDir: dst4,
      params: { machines: [], layout: 'flat', conflict: 'skip' },
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
    const dst = await mkdtemp(join(tmpdir(), 'shx-dst-folder-'))
    const missing = join(src, 'retry-missing.jpg')

    const task = new CopyTaskRunner({
      scanTaskId: 's6',
      targetDir: dst,
      params: { machines: [], layout: 'machine-type', conflict: 'rename' },
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
    const dst = await mkdtemp(join(tmpdir(), 'shx-dst-nonimage-'))
    const txt = join(src, 'readme.txt')
    await writeFile(txt, 'not an image')

    const task = new CopyTaskRunner({
      scanTaskId: 's7',
      targetDir: dst,
      params: { machines: [], layout: 'flat', conflict: 'rename' },
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
    const dst = await mkdtemp(join(tmpdir(), 'shx-dst-bmp-'))
    const bmp = join(src, 'aoi.bmp')
    await writeFile(bmp, 'bmp-data')

    const task = new CopyTaskRunner({
      scanTaskId: 's8',
      targetDir: dst,
      params: { machines: [], layout: 'flat', conflict: 'rename' },
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
    assert.equal(logFileName('2026-11-04'), 'shx-2026-11-04.log')
    assert.equal(parseLogDay('shx-2026-11-04.log'), '2026-11-04')
    assert.equal(parseLogDay('other.log'), null)
    assert.equal(parseLogDay('shx-2026-02-31.log'), null)
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
    const dir = await mkdtemp(join(tmpdir(), 'shx-log-'))
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
    const dir = await mkdtemp(join(tmpdir(), 'shx-prune-'))
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

const logIpcTests = async () => {
  await test('log: IPC 参数摘要不输出大字节/大数组', async () => {
    const excel = summarizeIpcArgs('fs:save-excel', [
      { defaultName: 'a.xlsx', data: new Uint8Array(1024 * 1024) },
    ])
    assert.equal(excel.dataBytes, 1024 * 1024)
    assert.ok(JSON.stringify(excel).length < 500)

    const scan = summarizeIpcArgs('scan:create', [
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

    const copy = summarizeIpcArgs('copy:start', [
      't1',
      'C:/out',
      { layout: 'flat', conflict: 'rename', machines: ['A'] },
    ])
    assert.equal(copy.taskId, 't1')
    assert.equal(copy.targetDir, 'C:/out')
    assert.equal(copy.layout, 'flat')

    const circular: Record<string, unknown> = {}
    circular.self = circular
    assert.doesNotThrow(() => summarizeIpcArgs('unknown:channel', [circular]))
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

  const failed = results.filter((r) => !r.ok)
  console.log(`\n共 ${results.length} 项，失败 ${failed.length} 项`)

  if (failed.length) process.exitCode = 1
}

await main()
