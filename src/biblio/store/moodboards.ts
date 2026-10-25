import { create } from 'zustand'
import type { ImageRef } from '@/biblio/lib/moodboard.ts'
import { addToMoodboard, createMoodboard, deleteMoodboard, listMoodboards, renameMoodboard, type MoodboardCard } from '@/biblio/lib/moodboards.ts'
import { useToast } from '@/biblio/store/toast.ts'

interface MoodboardsState {
  cards: MoodboardCard[]
  loaded: boolean
  load: () => Promise<void>
  /** Crée un moodboard vide et rend son identifiant. */
  create: (name: string, collectionId?: string | null) => Promise<string>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Pose des images de la bibliothèque sur un moodboard (sans les copier) et le dit à l'écran. */
  addBlocks: (id: string, name: string, refs: ImageRef[]) => Promise<void>
}

export const useMoodboards = create<MoodboardsState>((set) => {
  const refresh = async () => set({ cards: await listMoodboards(), loaded: true })
  return {
    cards: [],
    loaded: false,
    load: refresh,
    async create(name, collectionId = null) {
      const id = await createMoodboard(name, collectionId)
      await refresh()
      return id
    },
    async rename(id, name) {
      await renameMoodboard(id, name)
      await refresh()
    },
    async remove(id) {
      await deleteMoodboard(id)
      await refresh()
    },
    async addBlocks(id, name, refs) {
      const { added, skipped } = await addToMoodboard(id, refs)
      await refresh()
      const text = added === 0
        ? `Déjà dans « ${name} ».`
        : `${added} image${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''} à « ${name} »${skipped > 0 ? ` (${skipped} déjà présente${skipped > 1 ? 's' : ''})` : ''}.`
      useToast.getState().show(text)
    },
  }
})
