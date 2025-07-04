#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

// 从标准输入读取 commit message（通过 git commit 的 -m 参数或编辑器）
const commitMsg = process.argv[2] || process.env.COMMIT_MSG || ''

// 读取 package.json
const pkgPath = path.resolve(__dirname, '../', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
let [major, minor, patch] = pkg.version.split('.').map(Number)

// 判断递增规则
if (/BREAKING CHANGE/.test(commitMsg) || /!/.test(commitMsg)) {
  major += 1
  minor = 0
  patch = 0
} else if (/^feat[(:\s)]/m.test(commitMsg)) {
  minor += 1
  patch = 0
} else if (/^fix[(:\s)]/m.test(commitMsg)) {
  patch += 1
}

// 生成新版本号
const newVersion = [major, minor, patch].join('.')
if (newVersion !== pkg.version) {
  const oldVersion = pkg.version
  pkg.version = newVersion
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`版本号已更新:${oldVersion} -> ${newVersion}`)
}
