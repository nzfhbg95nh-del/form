import { create } from 'zustand'
import type { LibraryPageId } from './nav.ts'

/** D'où l'on venait quand on a demandé « Voir sur la carte » : on y revient avec « Retour à l'image ». */
export interface MapOrigin {
  /** L'écran de Form (bibliothèque, page, etc.). */
  view: string
  /** La page ouverte, si c'était une page. */
  selectedId: string | null
  /** L'onglet de la bibliothèque (Tout, Collections…). */
  libPage: LibraryPageId
}

/** Une demande « Voir sur la carte » venue d'ailleurs (vue détail, tableau) : la carte s'ouvre sur cette image. */
interface MapRequestState {
  request: number
  blockId: string | null
  /** L'image d'où l'on vient (vue détail) : la carte propose d'y retourner. */
  backTo: string | null
  /** L'écran d'où l'on vient : « Retour à l'image » y remet, et fermer la vue détail laisse sur cet écran (pas sur la carte). */
  origin: MapOrigin | null
  open: (blockId: string, backTo?: string, origin?: MapOrigin) => void
  clearBack: () => void
}

export const useMapRequest = create<MapRequestState>((set) => ({
  request: 0,
  blockId: null,
  backTo: null,
  origin: null,
  open: (blockId, backTo, origin) => set((s) => ({ request: s.request + 1, blockId, backTo: backTo ?? null, origin: origin ?? null })),
  clearBack: () => set({ backTo: null, origin: null }),
}))
