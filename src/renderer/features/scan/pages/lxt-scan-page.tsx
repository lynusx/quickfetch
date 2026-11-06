import { useEffect } from 'react'

import LxtFilterPanel from '../components/lxt-filter-panel'
import LxtMachinePicker from '../components/lxt-machine-picker'
import PlantScanPage from '../components/plant-scan-page'
import { NETWORK_HINT } from '@shared/networkHint'
import { SCAN_CATEGORY_META } from '@shared/scanCategories'
import { usePlantScanPage } from '../hooks/usePlantScanPage'
import { useLxtFilterStore } from '../stores/lxtFilterStore'
import {
  selectLxt,
  useSettingsStore,
  useUserPreferencesStore,
} from '@/features/settings'

/**
 * 力禧特图片扫描。
 *
 * 与其他「厂区/机台」类扫描共用同一套页面骨架（PlantScanPage），
 * 这里只提供力禧特自己的机台来源与筛选面板。
 */
const META = SCAN_CATEGORY_META.lxt

const LxtScanPage = () => {
  const lxt = useSettingsStore(selectLxt)
  const load = useSettingsStore((state) => state.load)
  const lxtTypes = useUserPreferencesStore(
    (state) => state[META.typeCatalogKey],
  )

  useEffect(() => {
    void load()
  }, [load])

  const configured = Boolean(lxt.entryRoot)
  const active = lxt.machines.filter((item) => !item.stale)
  const { ready, missing, filterSignature, getParams, getSignature } =
    usePlantScanPage({
      store: useLxtFilterStore,
      configured,
      hasSlots: META.hasSlots,
      requiresLevels: META.requiresLevels,
      typeCatalog: lxtTypes,
    })

  return (
    <PlantScanPage
      category="lxt"
      title="力禧特EL图片批量拷贝"
      unconfigured={{
        title: '先配置力禧特EL入口',
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
      getSignature={getSignature}
      picker={<LxtMachinePicker machines={lxt.machines} />}
      filterPanel={<LxtFilterPanel />}
    />
  )
}

export default LxtScanPage
