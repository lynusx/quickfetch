import { create } from 'zustand'
import { unique } from 'radash'
import { devtools, persist } from 'zustand/middleware'

interface UserPreferencesState {
  ngTypes: string[]
}

interface UserPreferencesAction {
  addNgType: (type: string) => void
  removeNgType: (type: string) => void
}

export const useUserPreferencesStore = create<
  UserPreferencesState & UserPreferencesAction
>()(
  devtools(
    persist(
      (set) => ({
        ngTypes: ['NG_脏污_B', 'NG_脏污_C'],
        addNgType: (type: string) =>
          set((state) => ({ ngTypes: unique([...state.ngTypes, type]) })),
        removeNgType: (type: string) =>
          set((state) => ({
            ngTypes: state.ngTypes.filter((t) => t !== type),
          })),
      }),
      { name: 'user-preferences' },
    ),
  ),
)
