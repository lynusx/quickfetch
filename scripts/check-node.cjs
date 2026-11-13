#!/usr/bin/env node
// Node 版本的唯一真相是 package.json 的 engines.node。
// preinstall / predev / prestart 都走这里：版本不符直接退出，
// 避免用错版本装出坏依赖，或拉起 Electron 后只看到一个退出码。
// 不依赖第三方包：preinstall 阶段 node_modules 还不存在。
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const manifest = readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
const required = JSON.parse(manifest).engines?.node
const current = process.version.replace(/^v/, '')

if (!required) {
  console.warn('[check-node] package.json 未声明 engines.node，跳过检查')
  process.exit(0)
}

if (!satisfies(current, required)) {
  const major = /\d+/.exec(required)?.[0] ?? '<版本>'
  console.error(`[check-node] 需要 Node ${required}，当前 v${current}。`)
  console.error(
    `[check-node] 安装：fnm install ${major} 或 nvm install ${major}`,
  )
  process.exit(1)
}

// 只覆盖 engines.node 的常见写法：^x.y.z、~x.y.z、>=x.y.z、x.y、x。
// 遇到不认识的写法宁可拦下，也不要静默放行。
function satisfies(version, range) {
  return range.split('||').some((alternative) =>
    alternative
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .every((comparator) => matches(version, comparator)),
  )
}

function matches(version, comparator) {
  if (comparator === '*' || comparator === 'x' || comparator === 'X')
    return true

  const parsed =
    /^(>=|<=|>|<|=|\^|~)?v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/.exec(
      comparator,
    )
  if (!parsed) return false

  const [, operator = '=', majorRaw, minorRaw, patchRaw] = parsed
  const major = Number(majorRaw)
  const minor = isWildcard(minorRaw) ? null : Number(minorRaw)
  const patch = isWildcard(patchRaw) ? null : Number(patchRaw)
  const target = [major, minor ?? 0, patch ?? 0]
  const actual = version.split('.').map(Number)

  if (operator === '=') {
    if (minor === null) return actual[0] === major
    if (patch === null) return actual[0] === major && actual[1] === minor
    return compare(actual, target) === 0
  }
  if (operator === '>=') return compare(actual, target) >= 0
  if (operator === '>') return compare(actual, target) > 0
  if (operator === '<=') return compare(actual, target) <= 0
  if (operator === '<') return compare(actual, target) < 0
  if (operator === '^') {
    return (
      compare(actual, target) >= 0 &&
      compare(actual, caretUpper(major, minor, patch)) < 0
    )
  }
  if (operator === '~') {
    const upper = minor === null ? [major + 1, 0, 0] : [major, minor + 1, 0]
    return compare(actual, target) >= 0 && compare(actual, upper) < 0
  }
  return false
}

function isWildcard(raw) {
  return raw === undefined || /^[xX*]$/.test(raw)
}

function caretUpper(major, minor, patch) {
  if (major > 0) return [major + 1, 0, 0]
  if (minor === null) return [major + 1, 0, 0]
  if (minor > 0) return [0, minor + 1, 0]
  return [0, 0, (patch ?? 0) + 1]
}

function compare(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}
