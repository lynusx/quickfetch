import {
  CircleAlert,
  CircleCheck,
  Download,
  FolderOpen,
  Loader2,
} from 'lucide-react'

import ImageFilterPanel from '@/components/ImageFilterPanel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useImageCopy } from '@/hooks/useImageCopy'
import { useToast } from '@/hooks/useToast'
import { useImageStore } from '@/stores/imageStore'

const Metric = ({
  value,
  label,
}: {
  value: string | number
  label: string
}) => (
  <div className="flex flex-col items-center justify-center gap-1 px-3 py-3">
    <span className="text-2xl font-semibold tabular-nums">{value}</span>
    <span className="text-xs text-muted-foreground">{label}</span>
  </div>
)

const StepBadge = ({ index }: { index: number }) => (
  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold tabular-nums">
    {index}
  </span>
)

const ImageCopyPage = () => {
  const { showToast } = useToast()
  const { images, copiedImageCount, isCopy, isScan, isError, error } =
    useImageStore()
  const {
    canStartScan,
    canStartCopy,
    getCopyProgress,
    handleImageScan,
    handleImageCopy,
  } = useImageCopy({ showToast })

  const progress = getCopyProgress()

  const status = isScan
    ? { label: '扫描中', variant: 'secondary' as const }
    : isCopy
      ? { label: '复制中', variant: 'secondary' as const }
      : isError
        ? { label: '异常', variant: 'destructive' as const }
        : images.length > 0
          ? { label: '待复制', variant: 'default' as const }
          : { label: '就绪', variant: 'outline' as const }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            图片批量拷贝
          </h1>
          <Badge variant="secondary">活跃</Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          按 DC
          目录层级扫描指定厂区、日期与班次的图片，再批量拷贝到目标目录，并生成
          source.txt 路径清单。
        </p>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* 参数面板 */}
        <Card className="xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle>扫描配置</CardTitle>
            <CardDescription>
              目录结构：DC / 厂区 / EL / 日期 / 班次 / 时段 / 类型
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImageFilterPanel />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          {/* 执行区 */}
          <Card>
            <CardHeader>
              <CardTitle>执行</CardTitle>
              <CardDescription>
                先扫描源目录确认数量，再选择目标目录完成拷贝
              </CardDescription>
              <CardAction>
                <Badge variant={status.variant}>{status.label}</Badge>
              </CardAction>
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
              <div className="grid grid-cols-3 divide-x rounded-lg border">
                <Metric value={images.length} label="匹配图片" />
                <Metric value={copiedImageCount} label="已复制" />
                <Metric value={`${progress}%`} label="进度" />
              </div>

              <div className="flex items-start gap-3">
                <StepBadge index={1} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium">扫描源目录</p>
                    <p className="text-xs text-muted-foreground">
                      选择名为 DC 的根目录，按当前配置匹配图片
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={handleImageScan}
                      disabled={!canStartScan()}
                    >
                      {isScan ? (
                        <Loader2
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      ) : (
                        <FolderOpen data-icon="inline-start" />
                      )}
                      {isScan ? '扫描中…' : '选择 DC 目录'}
                    </Button>
                    {images.length > 0 && (
                      <Badge variant="secondary">
                        <CircleCheck data-icon="inline-start" />
                        {images.length} 张
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex items-start gap-3">
                <StepBadge index={2} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium">复制到目标目录</p>
                    <p className="text-xs text-muted-foreground">
                      图片按文件名平铺拷贝，并在目标目录写入 source.txt
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={handleImageCopy}
                      disabled={!canStartCopy()}
                    >
                      {isCopy ? (
                        <Loader2
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      ) : (
                        <Download data-icon="inline-start" />
                      )}
                      {isCopy ? '复制中…' : '选择目标目录'}
                    </Button>
                    {copiedImageCount > 0 && (
                      <Badge variant="secondary">
                        <CircleCheck data-icon="inline-start" />
                        {progress}%
                      </Badge>
                    )}
                  </div>

                  {(isCopy || copiedImageCount > 0) && (
                    <div className="mt-1 flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">复制进度</span>
                        <span className="tabular-nums text-muted-foreground">
                          {copiedImageCount} / {images.length} 张
                        </span>
                      </div>
                      <Progress value={progress} />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {isError && error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>操作失败</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          {/* 使用说明 */}
          <Card>
            <CardHeader>
              <CardTitle>使用说明</CardTitle>
              <CardDescription>
                三步完成一次拷贝：配置参数、扫描、复制
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-4 text-sm">
                <li className="flex gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    01
                  </span>
                  <span>
                    <span className="font-medium">参数配置。</span>
                    <span className="text-muted-foreground">
                      选择厂区、图片类型，系统会根据当前时间自动带出日期、班次与时段。
                    </span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    02
                  </span>
                  <span>
                    <span className="font-medium">扫描文件。</span>
                    <span className="text-muted-foreground">
                      选择 DC 目录，系统会递归匹配符合条件的所有子目录。
                    </span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    03
                  </span>
                  <span>
                    <span className="font-medium">批量拷贝。</span>
                    <span className="text-muted-foreground">
                      选择目标路径，图片将拷贝到该目录，并生成记录来源路径的
                      source.txt。
                    </span>
                  </span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default ImageCopyPage
