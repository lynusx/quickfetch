import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface UserPreferencesState {
  ngTypes: string[]
  /**
   * 力禧特的不良类型清单，跟 EL 分开存。
   *
   * 两类的命名规则不一样（力禧特有 NG_星隐裂_C、NG_鱼叉黑_A- 这种），
   * 混在一份里会越铺越长，还容易在 EL 页勾到只有力禧特才有的类型。
   */
  lxtTypes: string[]
  /**
   * 利珀的不良类型清单，同样单独存。
   *
   * 利珀的类型目录就是纯名字（脏污、面划伤、黑边、明暗片），
   * 没有 EL 的 NG_ 前缀，混进同一份列表反而容易勾错。
   */
  plTypes: string[]
}

interface UserPreferencesAction {
  addNgType: (type: string) => void
  removeNgType: (type: string) => void
  addLxtType: (type: string) => void
  removeLxtType: (type: string) => void
  addPlType: (type: string) => void
  removePlType: (type: string) => void
}

/**
 * v1 时期塞进默认值的样本清单。
 *
 * 三类都不该替用户预设类型：现场命名差异大，猜错一次就会扫出一堆空目录，
 * 用户还得先删掉猜错的。所以从 v2 起三份清单一律空着，谁用谁加。
 * 迁移时只在「整份等于当时的预置值」时才清空 —— 用户自己加过的保留。
 */
const LEGACY_NG_TYPES = ['NG_脏污_B', 'NG_脏污_C']
const LEGACY_PL_TYPES = ['脏污', '面划伤', '黑边', '明暗片']

const sameList = (list: string[] | undefined, preset: string[]): boolean =>
  Array.isArray(list) &&
  list.length === preset.length &&
  preset.every((item) => list.includes(item))

const uniqueStrings = (list: string[]): string[] => [...new Set(list)]

export const useUserPreferencesStore = create<
  UserPreferencesState & UserPreferencesAction
>()(
  devtools(
    persist(
      (set) => ({
        ngTypes: [],
        lxtTypes: [],
        plTypes: [],
        addNgType: (type: string) =>
          set((state) => ({
            ngTypes: uniqueStrings([...state.ngTypes, type]),
          })),
        removeNgType: (type: string) =>
          set((state) => ({
            ngTypes: state.ngTypes.filter((t) => t !== type),
          })),
        addLxtType: (type: string) =>
          set((state) => ({
            lxtTypes: uniqueStrings([...(state.lxtTypes ?? []), type]),
          })),
        removeLxtType: (type: string) =>
          set((state) => ({
            lxtTypes: (state.lxtTypes ?? []).filter((t) => t !== type),
          })),
        addPlType: (type: string) =>
          set((state) => ({
            plTypes: uniqueStrings([...(state.plTypes ?? []), type]),
          })),
        removePlType: (type: string) =>
          set((state) => ({
            plTypes: (state.plTypes ?? []).filter((t) => t !== type),
          })),
      }),
      {
        name: 'user-preferences',
        version: 2,
        migrate: (persisted, version) => {
          const state = (persisted ?? {}) as Partial<UserPreferencesState>

          if (version >= 2) return state as UserPreferencesState

          return {
            ...state,
            ngTypes: sameList(state.ngTypes, LEGACY_NG_TYPES)
              ? []
              : (state.ngTypes ?? []),
            lxtTypes: state.lxtTypes ?? [],
            plTypes: sameList(state.plTypes, LEGACY_PL_TYPES)
              ? []
              : (state.plTypes ?? []),
          } as UserPreferencesState
        },
      },
    ),
  ),
)
