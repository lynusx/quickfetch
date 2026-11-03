/**
 * 现场网络环境的唯一说明。
 *
 * 四类扫描（EL / 力禧特 / 利珀 / 森标 AOI）的机台全部挂在同一张
 * JA-PDA 无线网上，认证域是 JASOLAR。以前每处的提示文案各写各的
 * （"专用内网"、"共享盘连接"、"森标 AOI 专用内网"…），
 * 现场拿到截图后无法确认到底该连哪张网。
 *
 * 这里收成一份常量，主进程与界面共用，改一次就全变。
 */

/** 现场机台所在的无线网名 */
export const NETWORK_NAME = 'JA-PDA'

/** 网络凭据的域 */
export const AUTH_DOMAIN = 'JASOLAR'

/** 断网/不可达时的统一提示；主进程的机台结果文案也用它 */
export const NETWORK_HINT = `机台都在 ${NETWORK_NAME} 无线网内，请先连接该网络再重试`

/** 未认证时的统一提示 */
export const AUTH_HINT = `请用资源管理器打开该地址并输入账号密码（域 ${AUTH_DOMAIN}），凭据会被系统记住`
