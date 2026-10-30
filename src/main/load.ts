/**
 * 现场机器资源档位。
 *
 * 现场电脑为 8G 内存 + 256G 盘，且图片根目录在共享盘上，
 * 所以并发与分批不开放给用户调，集中放在这里：出问题只改一处。
 * 需要临时压降时用环境变量覆盖，不必重新打包。
 */
const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const load = {
  /** 同时进行的目录读取数 */
  readConcurrency: toInt(process.env.SHX_READ_CONCURRENCY, 4),
  /** 每批并行扫描的机台数 */
  machineBatchSize: toInt(process.env.SHX_MACHINE_BATCH, 2),
  /** 同时复制的文件数 */
  copyConcurrency: toInt(process.env.SHX_COPY_CONCURRENCY, 6),
  /** 每批复制的文件数 */
  copyBatchSize: toInt(process.env.SHX_COPY_BATCH, 50),
}
