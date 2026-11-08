#!/usr/bin/env node
/**
 * 发布前校验：保证 dist:win 打出的包对应一次已提交、可打 tag 的版本。
 *
 * 版本号只有一个来源——根 package.json。安装包文件名、asar 内 package.json、
 * 运行时 app.getVersion() 与界面显示都读它。若工作区里的 version 还没提交，
 * 或工作区有未提交改动，同一个版本号就可能对应两个不同的构建，之后再打 tag
 * 也说不清发布的是哪份代码。
 *
 * 用法：
 *   node scripts/check-release.cjs          # dist:win 会先跑这个
 *   SKIP_RELEASE_CHECK=1 node scripts/...   # 明确要求未提交出包时跳过 Git 检查
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const PREFIX = '[check-release]'

const fail = (title, detail) => {
  console.error(`${PREFIX} 打包中止：${title}`)
  if (detail) console.error(detail)
  process.exit(1)
}

const git = (args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

let pkg

try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
} catch (error) {
  fail(
    `无法读取 package.json：${error.message}`,
    '文件可能被写坏，或 merge/rebase 的冲突标记还留在里面。\n' +
      '请先解决冲突并完成或中止该操作，再运行 pnpm dist:win。',
  )
}

const version = String(pkg.version ?? '')

// 版本格式始终检查：覆盖开关只跳过 Git 校验，不能把非法版本交给 electron-builder
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(
    `package.json 的 version 是 ${pkg.version ?? '(缺失)'}，不是 x.y.z。`,
    'electron-builder 的产物名与 app.getVersion() 都直接使用它，\n' +
      '请改成 3.2.0 这种三段数字后再打包。',
  )
}

if (process.env.SKIP_RELEASE_CHECK === '1') {
  console.log(
    `${PREFIX} SKIP_RELEASE_CHECK=1，跳过 Git 校验（仅限明确要求未提交出包）`,
  )
  process.exit(0)
}

let insideWorkTree = false

try {
  insideWorkTree = git(['rev-parse', '--is-inside-work-tree']) === 'true'
} catch {
  insideWorkTree = false
}

if (!insideWorkTree) {
  fail(
    '当前目录不是 Git 仓库，无法确认发布包对应哪次提交。',
    '请在仓库根目录运行；确认要在无 Git 信息时出包，设置 SKIP_RELEASE_CHECK=1。',
  )
}

// merge / rebase / cherry-pick / revert 进行中时 HEAD 不是最终提交，打 tag 没有意义
const pendingOperations = [
  ['MERGE_HEAD', 'merge'],
  ['rebase-merge', 'rebase'],
  ['rebase-apply', 'rebase/am'],
  ['CHERRY_PICK_HEAD', 'cherry-pick'],
  ['REVERT_HEAD', 'revert'],
]

for (const [marker, label] of pendingOperations) {
  let markerPath

  try {
    markerPath = git(['rev-parse', '--git-path', marker])
  } catch {
    continue
  }

  if (markerPath && fs.existsSync(path.resolve(root, markerPath))) {
    fail(
      `检测到 ${label} 进行中，HEAD 尚未指向最终提交。`,
      '此时打包无法用 tag 回溯到重放后的代码。\n' +
        '请先完成或中止该操作，再运行 pnpm dist:win。',
    )
  }
}

let headVersion

try {
  headVersion = JSON.parse(git(['show', 'HEAD:package.json'])).version
} catch {
  fail(
    '读取 HEAD 的 package.json 失败。',
    '仓库可能还没有提交，或 HEAD 不可用。',
  )
}

if (headVersion !== version) {
  fail(
    `package.json 版本 ${version} 与 HEAD 的 ${headVersion} 不一致。`,
    '发布包必须对应一次已提交的版本，否则 git tag 无法准确追溯。\n' +
      '请提交版本号改动后再打包。',
  )
}

let dirty = ''

try {
  dirty = git(['status', '--porcelain', '--untracked-files=normal'])
} catch (error) {
  fail(`读取 git 工作区状态失败：${error.message}`)
}

if (dirty) {
  const lines = dirty.split('\n').filter(Boolean)
  const shown = lines
    .slice(0, 10)
    .map((line) => `  ${line}`)
    .join('\n')
  const rest = lines.length > 10 ? `\n  …另有 ${lines.length - 10} 项` : ''

  fail(
    `工作区有 ${lines.length} 处未提交改动。`,
    `${shown}${rest}\n\n` +
      'out/ 与 release/ 已被 .gitignore 忽略，不会出现在这里。\n' +
      '请提交或 git stash 后重试；仅当明确要求未提交出包时，设置 SKIP_RELEASE_CHECK=1。',
  )
}

const shortSha = git(['rev-parse', '--short', 'HEAD'])

console.log(`${PREFIX} 通过：v${version} @ ${shortSha}，工作区干净`)
console.log(`${PREFIX} 发布后请手工打 tag：git tag v${version}`)
