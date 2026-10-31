import { create } from 'zustand'
import { unique } from 'radash'
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
}

interface UserPreferencesAction {
  addNgType: (type: string) => void
  removeNgType: (type: string) => void
  addLxtType: (type: string) => void
  removeLxtType: (type: string) => void
}

export const useUserPreferencesStore = create<
  UserPreferencesState & UserPreferencesAction
>()(
  devtools(
    persist(
      (set) => ({
        ngTypes: ['NG_脏污_B', 'NG_脏污_C'],
        lxtTypes: [],
        addNgType: (type: string) =>
          set((state) => ({ ngTypes: unique([...state.ngTypes, type]) })),
        removeNgType: (type: string) =>
          set((state) => ({
            ngTypes: state.ngTypes.filter((t) => t !== type),
          })),
        addLxtType: (type: string) =>
          set((state) => ({
            lxtTypes: unique([...(state.lxtTypes ?? []), type]),
          })),
        removeLxtType: (type: string) =>
          set((state) => ({
            lxtTypes: (state.lxtTypes ?? []).filter((t) => t !== type),
          })),
      }),
      { name: 'user-preferences' },
    ),
  ),
)
