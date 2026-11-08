import { useEffect } from 'react'

import PlFilterPanel from '../components/pl-filter-panel'
import PlMachinePicker from '../components/pl-machine-picker'
import PlantScanPage from '../components/plant-scan-page'
import {
  NoMachinesNotice,
  UnconfiguredNotice,
} from '../components/scan-notices'
import { NETWORK_HINT } from '@shared/networkHint'
import { usePlantScanPage } from '../hooks/usePlantScanPage'
import { selectPl, useSettingsStore } from '@/features/settings'

/**
 * 利珀图片扫描。
 *
 * 与力禧特共用页面骨架与选择器，差别只有路径层级：利珀在日期下多一层
 * 机台名、类型外面还包着 Fail/等级，所以筛选面板多了「等级」。
 */
const PlScanPage = () => {
  const pl = useSettingsStore(selectPl)
  const load = useSettingsStore((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  const configured = Boolean(pl.entryRoot)
  const active = pl.machines.filter((item) => !item.stale)
  const { ready, missing, filterSignature, getParams, getSignature } =
    usePlantScanPage({
      category: 'pl',
      configured,
      typeCatalog: pl.typeCatalog,
    })

  return (
    <PlantScanPage
      category="pl"
      title="利珀PL图片批量拷贝"
      notices={
        !configured ? (
          <UnconfiguredNotice
            title="先配置利珀PL入口"
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
      picker={<PlMachinePicker machines={pl.machines} />}
      filterPanel={<PlFilterPanel />}
    />
  )
}

export default PlScanPage
