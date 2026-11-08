import { useEffect } from 'react'

import AoiFilterPanel from '../components/aoi-filter-panel'
import AoiMachinePicker from '../components/aoi-machine-picker'
import PlantScanPage from '../components/plant-scan-page'
import {
  NoMachinesNotice,
  UnconfiguredNotice,
} from '../components/scan-notices'
import { NETWORK_HINT } from '@shared/networkHint'
import { usePlantScanPage } from '../hooks/usePlantScanPage'
import { selectAoi, useSettingsStore } from '@/features/settings'

/**
 * 森标 AOI 图片扫描。
 *
 * 与其他「厂区/机台」类扫描共用同一套页面骨架（PlantScanPage），
 * 这里只提供 AOI 自己的机台来源与筛选面板。路径没有时段层，
 * 因此 getParams 固定传 slots: []。
 */
const AoiScanPage = () => {
  const aoi = useSettingsStore(selectAoi)
  const load = useSettingsStore((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  const configured = Boolean(aoi.entryRoot)
  const active = aoi.machines.filter((item) => !item.stale)
  const { ready, missing, filterSignature, getParams, getSignature } =
    usePlantScanPage({
      category: 'aoi',
      configured,
      typeCatalog: aoi.typeCatalog,
    })

  return (
    <PlantScanPage
      category="aoi"
      title="森标 AOI 图片批量拷贝"
      notices={
        !configured ? (
          <UnconfiguredNotice
            title="先配置森标 AOI 入口"
            description="在左侧选择入口目录，应用会解析其中的快捷方式并识别各厂区机台"
          />
        ) : active.length === 0 ? (
          <NoMachinesNotice />
        ) : undefined
      }
      networkHint={`${NETWORK_HINT}；点「继续」即可接着扫，已扫到的结果不会丢`}
      ready={ready}
      missing={missing}
      getParams={getParams}
      filterSignature={filterSignature}
      getSignature={getSignature}
      picker={<AoiMachinePicker machines={aoi.machines} />}
      filterPanel={<AoiFilterPanel />}
    />
  )
}

export default AoiScanPage
