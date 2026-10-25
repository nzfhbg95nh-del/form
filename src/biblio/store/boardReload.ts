import { create } from 'zustand'

/** Un compteur par moodboard : quand on y ajoute des images de la bibliothèque, sa toile ouverte est rechargée (la clé change). */
interface ReloadState {
  n: Record<string, number>
  bump: (boardId: string) => void
}

export const useBoardReload = create<ReloadState>((set) => ({
  n: {},
  bump: (boardId) => set((s) => ({ n: { ...s.n, [boardId]: (s.n[boardId] ?? 0) + 1 } })),
}))
