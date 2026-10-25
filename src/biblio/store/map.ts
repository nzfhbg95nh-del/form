import { create } from 'zustand'

/** Une demande « Voir sur la carte » venue d'ailleurs (vue détail, tableau) : la carte s'ouvre sur cette image. */
interface MapRequestState {
  request: number
  blockId: string | null
  open: (blockId: string) => void
}

export const useMapRequest = create<MapRequestState>((set) => ({
  request: 0,
  blockId: null,
  open: (blockId) => set((s) => ({ request: s.request + 1, blockId })),
}))
