import { create } from 'zustand'
import { triageCount } from '@/biblio/lib/triage.ts'

interface TriageState {
  /** Nombre d'images arrivées depuis le dernier tri. */
  count: number
  /** L'écran de tri est ouvert. */
  open: boolean
  refresh: () => Promise<void>
  show: () => void
  hide: () => void
}

export const useTriage = create<TriageState>((set) => ({
  count: 0,
  open: false,
  async refresh() {
    set({ count: await triageCount().catch(() => 0) })
  },
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))
