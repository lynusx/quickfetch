#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

// 获取 commit message
let commitMsg = ''
if (process.argv[2] && fs.existsSync(process.argv[2])) {
  try {
    commitMsg = fs.readFileSync(process.argv[2], 'utf8')
  } catch (e) {
    console.error(`读取提交消息文件失败: ${e.message}`)
    process.exit(1)
  }
} else if (process.argv[2]) {
  commitMsg = process.argv[2]
} else if (process.env.COMMIT_MSG) {
  commitMsg = process.env.COMMIT_MSG
} else {
  console.error('错误：无法获取提交消息')
  process.exit(1)
}

// 读取 package.json
const pkgPath = path.resolve(__dirname, '../', 'package.json')
let pkg
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
} catch (e) {
  console.error(`读取 package.json 失败: ${e.message}`)
  process.exit(1)
}

let [major, minor, patch] = pkg.version.split('.').map(Number)
const originalVersion = pkg.version

// 判断递增规则（忽略注释行）
const lines = commitMsg.split('\n')
const validLines = lines.filter(
  (line) => !line.startsWith('#') && line.trim() !== '',
)

// 检测重大变更 (任何位置包含 BREAKING CHANGE 或类型后有!)
const isBreakingChange = validLines.some(
  (line) =>
    /(^|\s)BREAKING CHANGE(\s|:|$)/i.test(line) || // 匹配 BREAKING CHANGE 不区分大小写
    /^[a-z]+(\(.*\))?!:/.test(line), // 匹配任何类型的!:
)

// 检测是否为 feat 或 fix 类型
const isFeat = validLines.some((line) => /^feat(\(.*\))?:/.test(line))
const isFix = validLines.some((line) => /^fix(\(.*\))?:/.test(line))

// 优先级：重大变更 > feat > fix
if (isBreakingChange) {
  major += 1
  minor = 0
  patch = 0
} else if (isFeat) {
  minor += 1
  patch = 0
} else if (isFix) {
  patch += 1
}

// 生成新版本号
const newVersion = [major, minor, patch].join('.')
if (newVersion !== pkg.version) {
  pkg.version = newVersion
  try {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`版本号已更新: ${originalVersion} → ${newVersion}`)
  } catch (e) {
    console.error(`写入 package.json 失败: ${e.message}`)
    process.exit(1)
  }
}
