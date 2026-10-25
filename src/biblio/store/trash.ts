import { create } from 'zustand'
import { deleteForever, restoreBlocks, trashBlocks, trashCount } from '@/biblio/lib/trash.ts'
import { useCollections } from '@/biblio/store/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { useToast } from '@/biblio/store/toast.ts'

interface TrashState {
  /** Nombre d'images dans la corbeille de Klippr. */
  count: number
  refresh: () => Promise<void>
  /** Met des images à la corbeille de Klippr (rien n'est touché sur le disque) ; un bouton « Annuler » les remet. */
  trash: (ids: string[]) => Promise<void>
  restore: (ids: string[]) => Promise<void>
  /** Supprime définitivement : les fichiers partent dans la Corbeille Windows et Klippr oublie les images. */
  purge: (ids: string[]) => Promise<{ deleted: number; failed: number }>
}

/** Après un changement : la grille, les tableaux et leurs comptes se relisent. */
async function reloadAll() {
  await useGrid.getState().load()
  await useCollections.getState().load()
}

export const useTrash = create<TrashState>((set, get) => ({
  count: 0,
  async refresh() {
    set({ count: await trashCount() })
  },
  async trash(ids) {
    if (ids.length === 0) return
    await trashBlocks(ids)
    useGrid.getState().clearSelection()
    await reloadAll()
    await get().refresh()
    useToast.getState().show(`${ids.length} image${ids.length > 1 ? 's' : ''} à la corbeille.`, { label: 'Annuler', run: () => void get().restore(ids) })
  },
  async restore(ids) {
    if (ids.length === 0) return
    await restoreBlocks(ids)
    await reloadAll()
    await get().refresh()
    useToast.getState().show(`${ids.length} image${ids.length > 1 ? 's' : ''} restaurée${ids.length > 1 ? 's' : ''}.`)
  },
  async purge(ids) {
    const root = useLibrary.getState().root
    if (!root) throw new Error('Le dossier de la bibliothèque est inconnu.')
    const result = await deleteForever(ids, root)
    await reloadAll()
    await get().refresh()
    const { deleted, failed } = result
    useToast.getState().show(
      failed > 0
        ? `${deleted} supprimée${deleted > 1 ? 's' : ''}, ${failed} impossible${failed > 1 ? 's' : ''} (fichier ouvert ailleurs ?).`
        : `${deleted} image${deleted > 1 ? 's' : ''} supprimée${deleted > 1 ? 's' : ''} : fichiers envoyés dans la Corbeille Windows.`,
    )
    return result
  },
}))
