import { create } from 'zustand'

/** Les pages de la bibliothèque dans Form. */
export type LibraryPageId = 'all' | 'collections' | 'map'

interface NavState {
  page: LibraryPageId
  go: (page: LibraryPageId) => void
}

export const useLibraryNav = create<NavState>((set) => ({
  page: 'all',
  go: (page) => set({ page }),
}))
