import { NETWORK_HINT } from '@shared/networkHint'

import { useSettingsStore, useUserPreferencesStore } from '@/features/settings'
import PlantScanPage from '../components/plant-scan-page'
import ElFilterPanel from '../components/el-filter-panel'
import ElSetupPanel from '../components/el-setup-panel'
import { usePlantScanPage } from '../hooks/usePlantScanPage'
import { useElFilterStore } from '../stores/elFilterStore'
import '../scan.css'

/**
 * EL 页与入口类页面共用同一个 page skeleton，只提供 DC 根目录 setup、
 * filter panel 与参数来源；scan/copy/history 的接线不再重复一份。
 */
const ElScanPage = () => {
  const settings = useSettingsStore((state) => state.settings)
  const ngTypes = useUserPreferencesStore((state) => state.ngTypes)
  const configured = Boolean(settings?.rootPath)

  const { ready, missing, filterSignature, getParams } = usePlantScanPage({
    store: useElFilterStore,
    configured,
    hasSlots: true,
    requiresLevels: false,
    typeCatalog: ngTypes,
  })

  return (
    <PlantScanPage
      category="el"
      title="EL 图片批量拷贝"
      description="按日期、班次与类型从 DC 共享盘收集 EL 图片，支持暂停续跑，并把命中的图片批量复制到本地。"
      unconfigured={{
        title: '还没有配置 DC 根目录',
        description: '在左侧填入或选择根目录后，才能开始扫描。',
      }}
      networkHint={`${NETWORK_HINT}；点「继续」即可接着扫，已扫到的结果不会丢`}
      configured={configured}
      ready={ready}
      missing={missing}
      getParams={getParams}
      filterSignature={filterSignature}
      picker={<ElSetupPanel />}
      filterPanel={<ElFilterPanel />}
    />
  )
}

export default ElScanPage
