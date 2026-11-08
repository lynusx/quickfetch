import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

import type { InstallMode } from '../../../shared/ipc'

/**
 * NSIS 安装目录会写一个卸载器；zip 解压目录没有。
 *
 * 找不到卸载器时保守按免安装处理：宁可只提示手动替换，
 * 也不要让 zip 用户误触发安装程序、在机器上多装一份。
 */
export const detectInstallModeFromDir = (
  exeDir: string,
  productName: string,
): InstallMode =>
  existsSync(join(exeDir, `Uninstall ${productName}.exe`))
    ? 'installed'
    : 'portable'

export const detectInstallMode = (): InstallMode => {
  if (!app.isPackaged) return 'portable'

  return detectInstallModeFromDir(dirname(app.getPath('exe')), app.getName())
}
