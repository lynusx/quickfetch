import { useEffect } from 'react'

import PlFilterPanel from '../components/pl-filter-panel'
import PlMachinePicker from '../components/pl-machine-picker'
import PlantScanPage from '../components/plant-scan-page'
import { NETWORK_HINT } from '@shared/networkHint'
import { SCAN_CATEGORY_META } from '@shared/scanCategories'
import { usePlantScanPage } from '../hooks/usePlantScanPage'
import { usePlFilterStore } from '../stores/plFilterStore'
import {
  selectPl,
  useSettingsStore,
  useUserPreferencesStore,
} from '@/features/settings'

/**
 * 利珀图片扫描。
 *
 * 与力禧特共用页面骨架与选择器，差别只有路径层级：利珀在日期下多一层
 * 机台名、类型外面还包着 Fail/等级，所以筛选面板多了「等级」。
 */
const META = SCAN_CATEGORY_META.pl

const PlScanPage = () => {
  const pl = useSettingsStore(selectPl)
  const load = useSettingsStore((state) => state.load)
  const plTypes = useUserPreferencesStore((state) => state[META.typeCatalogKey])

  useEffect(() => {
    void load()
  }, [load])

  const configured = Boolean(pl.entryRoot)
  const active = pl.machines.filter((item) => !item.stale)
  const { ready, missing, filterSignature, getParams } = usePlantScanPage({
    store: usePlFilterStore,
    configured,
    hasSlots: META.hasSlots,
    requiresLevels: META.requiresLevels,
    typeCatalog: plTypes,
  })

  return (
    <PlantScanPage
      category="pl"
      title="利珀PL图片批量拷贝"
      unconfigured={{
        title: '先配置利珀PL入口',
        description:
          '在左侧选择入口目录，应用会解析其中的快捷方式并识别各厂区机台',
      }}
      networkHint={`${NETWORK_HINT}；点「继续」即可接着扫，已扫到的结果不会丢`}
      configured={configured}
      activeMachines={active.length}
      ready={ready}
      missing={missing}
      getParams={getParams}
      filterSignature={filterSignature}
      picker={<PlMachinePicker machines={pl.machines} />}
      filterPanel={<PlFilterPanel />}
    />
  )
}

export default PlScanPage
