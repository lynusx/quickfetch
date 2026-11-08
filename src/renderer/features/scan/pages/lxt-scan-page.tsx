import { useEffect } from 'react'

import LxtFilterPanel from '../components/lxt-filter-panel'
import LxtMachinePicker from '../components/lxt-machine-picker'
import PlantScanPage from '../components/plant-scan-page'
import {
  NoMachinesNotice,
  UnconfiguredNotice,
} from '../components/scan-notices'
import { NETWORK_HINT } from '@shared/networkHint'
import { usePlantScanPage } from '../hooks/usePlantScanPage'
import { selectLxt, useSettingsStore } from '@/features/settings'

/**
 * 力禧特图片扫描。
 *
 * 与其他「厂区/机台」类扫描共用同一套页面骨架（PlantScanPage），
 * 这里只提供力禧特自己的机台来源与筛选面板。
 */
const LxtScanPage = () => {
  const lxt = useSettingsStore(selectLxt)
  const load = useSettingsStore((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  const configured = Boolean(lxt.entryRoot)
  const active = lxt.machines.filter((item) => !item.stale)
  const { ready, missing, filterSignature, getParams, getSignature } =
    usePlantScanPage({
      category: 'lxt',
      configured,
      typeCatalog: lxt.typeCatalog,
    })

  return (
    <PlantScanPage
      category="lxt"
      title="力禧特EL图片批量拷贝"
      notices={
        !configured ? (
          <UnconfiguredNotice
            title="先配置力禧特EL入口"
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
      picker={<LxtMachinePicker machines={lxt.machines} />}
      filterPanel={<LxtFilterPanel />}
    />
  )
}

export default LxtScanPage
