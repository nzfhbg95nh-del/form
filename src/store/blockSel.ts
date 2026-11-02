import { create } from 'zustand'

/** Les blocs sélectionnés d'une page (de `anchor` à `focus`, dans n'importe quel sens). Une seule page à la fois a une sélection. */
interface BlockSelState {
  pageId: string | null
  anchor: string | null
  focus: string | null
  set: (pageId: string, anchor: string, focus: string) => void
  clear: () => void
}

export const useBlockSel = create<BlockSelState>((set) => ({
  pageId: null,
  anchor: null,
  focus: null,
  set: (pageId, anchor, focus) => set({ pageId, anchor, focus }),
  clear: () => set((s) => (s.anchor === null ? s : { pageId: null, anchor: null, focus: null })),
}))
