import { useEffect } from 'react'

import { NETWORK_HINT } from '@shared/networkHint'

import { selectEl, useSettingsStore } from '@/features/settings'
import PlantScanPage from '../components/plant-scan-page'
import ElFilterPanel from '../components/el-filter-panel'
import ElSetupPanel from '../components/el-setup-panel'
import { usePlantScanPage } from '../hooks/usePlantScanPage'
import '../scan.css'

/**
 * EL 页与入口类页面共用同一个 page skeleton，只提供 DC 根目录 setup、
 * filter panel 与参数来源；scan/copy/history 的接线不再重复一份。
 */
const ElScanPage = () => {
  const el = useSettingsStore(selectEl)
  const load = useSettingsStore((state) => state.load)
  const configured = Boolean(el.entryRoot)
  const hasMachines = (el.machines?.length ?? 0) > 0

  useEffect(() => {
    void load()
  }, [load])

  const { ready, missing, filterSignature, getParams, getSignature } =
    usePlantScanPage({
      category: 'el',
      configured,
      typeCatalog: el.typeCatalog,
    })

  return (
    <PlantScanPage
      category="el"
      configured={configured}
      hasMachines={hasMachines}
      networkHint={`${NETWORK_HINT}；点「继续」即可接着扫，已扫到的结果不会丢`}
      ready={ready}
      missing={missing}
      getParams={getParams}
      filterSignature={filterSignature}
      getSignature={getSignature}
      scopeForm={<ElFilterPanel picker={<ElSetupPanel />} />}
    />
  )
}

export default ElScanPage
