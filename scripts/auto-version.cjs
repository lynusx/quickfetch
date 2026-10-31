#!/usr/bin/env node
/**
 * 提交时按 commit message 自动递增版本号。
 *
 * 只认第一行的类型：fix → patch、feat → minor、类型后带 `!` 或 footer 里
 * 写 BREAKING CHANGE → major。正文里出现的「fix:」示例不算类型，否则一条
 * chore 提交只要正文举了个例子就会莫名升版本。
 *
 * amend / rebase / cherry-pick 重放时跳过，否则补个漏掉的文件就会再升一个版本：
 * - rebase / cherry-pick 期间 Git 会留下 rebase-merge、CHERRY_PICK_HEAD 等标记，直接看这些
 * - amend 没有官方标记，用「提交信息与 HEAD 完全相同、且 HEAD 是刚提交的」来认
 *   （五分钟内），真想重算可以用 FORCE_VERSION=1
 *
 * 用法：
 *   node scripts/auto-version.cjs --file .git/COMMIT_EDITMSG   # 钩子里用这个
 *   node scripts/auto-version.cjs "fix(copy): 修个 bug"        # 手工临时调用
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const pkgPath = path.resolve(__dirname, '..', 'package.json')

/** amend 的时间窗口：超过这个时长还发同一条消息，当成新提交 */
const AMEND_WINDOW_MS = 10 * 60 * 1000

const git = (args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()

/** 取 git 内部路径（rebase 标记等）；不在仓库里时返回 null */
const gitPath = (name) => {
  try {
    return git(['rev-parse', '--git-path', name])
  } catch {
    return null
  }
}

/**
 * 是否处于「重放/修补」而不是「一次全新的提交」。
 * 这类提交的版本号在原来的提交里已经算过，不能再加一次。
 */
const isRewrite = (message) => {
  if (process.env.FORCE_VERSION === '1') return false

  for (const marker of ['rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD']) {
    const target = gitPath(marker)

    if (target && fs.existsSync(target)) return true
  }

  try {
    const last = git(['log', '-1', '--format=%B'])
    const minutesAgo =
      Date.now() - Number(git(['log', '-1', '--format=%ct'])) * 1000

    return last.trim() === message.trim() && minutesAgo < AMEND_WINDOW_MS
  } catch {
    // 还没有任何提交（首次提交）
    return false
  }
}

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

const readMessage = () => {
  const args = process.argv.slice(2)
  const fileIndex = args.indexOf('--file')

  if (fileIndex >= 0) {
    const file = args[fileIndex + 1]

    if (!file) fail('错误：--file 后面缺少提交消息文件路径')

    try {
      return fs.readFileSync(file, 'utf8')
    } catch (error) {
      fail(`读取提交消息文件失败: ${error.message}`)
    }
  }

  const inline = args[0] ?? process.env.COMMIT_MSG

  if (!inline) fail('错误：无法获取提交消息')

  return inline
}

const message = readMessage().replace(/\r\n/g, '\n')

let pkg

try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
} catch (error) {
  fail(`读取 package.json 失败: ${error.message}`)
}

const current = pkg.version
const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(current ?? '')

if (!parts) {
  // 带预发布后缀（1.2.3-beta.1）之类的情况不硬算，免得写成 NaN.NaN.NaN
  console.warn(`版本号 ${current} 不是 x.y.z 形式，跳过自动递增`)
  process.exit(0)
}

if (isRewrite(message)) {
  console.log(`版本号保持 ${current}（amend / rebase 重放，不重复递增）`)
  process.exit(0)
}

// 手工指定过版本号（比如打包前先提到 1.13.0），提交时用它跳过递增，
// 否则这批改动提交后又会被加一级，跟已发出的包对不上。
if (process.env.SKIP_VERSION === '1') {
  console.log(`版本号保持 ${current}（SKIP_VERSION=1）`)
  process.exit(0)
}

const [header = ''] = message.split('\n')
const typeMatch = /^([a-z]+)(?:\([^)]*\))?(!)?:/.exec(header.trim())
const type = typeMatch?.[1] ?? ''
const breaking =
  Boolean(typeMatch?.[2]) || /\bBREAKING[ -]CHANGE\b/.test(message)

const [major, minor, patch] = parts.slice(1).map(Number)

let next = null

if (breaking) {
  next = `${major + 1}.0.0`
} else if (type === 'feat') {
  next = `${major}.${minor + 1}.0`
} else if (type === 'fix') {
  next = `${major}.${minor}.${patch + 1}`
}

if (!next) {
  console.log(`版本号保持 ${current}（${type || '未知类型'} 提交不递增）`)
  process.exit(0)
}

pkg.version = next

try {
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
} catch (error) {
  fail(`写入 package.json 失败: ${error.message}`)
}

console.log(`版本号：${current} → ${next}`)
