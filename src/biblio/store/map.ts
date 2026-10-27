import { create } from 'zustand'

/** Une demande « Voir sur la carte » venue d'ailleurs (vue détail, tableau) : la carte s'ouvre sur cette image. */
interface MapRequestState {
  request: number
  blockId: string | null
  /** L'image d'où l'on vient (vue détail) : la carte propose d'y retourner. */
  backTo: string | null
  open: (blockId: string, backTo?: string) => void
  clearBack: () => void
}

export const useMapRequest = create<MapRequestState>((set) => ({
  request: 0,
  blockId: null,
  backTo: null,
  open: (blockId, backTo) => set((s) => ({ request: s.request + 1, blockId, backTo: backTo ?? null })),
  clearBack: () => set({ backTo: null }),
}))
