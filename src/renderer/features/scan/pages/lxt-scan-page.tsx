import { useEffect } from 'react'

import LxtFilterPanel from '../components/lxt-filter-panel'
import LxtMachinePicker from '../components/lxt-machine-picker'
import PlantScanPage from '../components/plant-scan-page'
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
      configured={configured}
      hasMachines={active.length > 0}
      networkHint={`${NETWORK_HINT}；点「继续」即可接着扫，已扫到的结果不会丢`}
      ready={ready}
      missing={missing}
      getParams={getParams}
      filterSignature={filterSignature}
      getSignature={getSignature}
      scopeForm={
        <LxtFilterPanel picker={<LxtMachinePicker machines={lxt.machines} />} />
      }
    />
  )
}

export default LxtScanPage
