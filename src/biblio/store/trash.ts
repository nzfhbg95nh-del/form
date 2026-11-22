import { create } from 'zustand'
import { deleteFilesForever, deleteForever, restoreBlocks, restoreFiles, trashBlocks, trashCount, trashFiles } from '@/biblio/lib/trash.ts'
import { useCollections } from '@/biblio/store/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { useToast } from '@/biblio/store/toast.ts'

interface TrashState {
  /** Nombre d'éléments dans la corbeille de la bibliothèque (images entières + images seules de carrousels). */
  count: number
  refresh: () => Promise<void>
  /** Met des images à la corbeille de la bibliothèque (rien n'est touché sur le disque) ; un bouton « Annuler » les remet. */
  trash: (ids: string[]) => Promise<void>
  /** Met à la corbeille des images prises dans un carrousel : le reste du carrousel reste. « Annuler » les remet. */
  trashCarouselFiles: (rels: string[]) => Promise<void>
  /** Remet des images entières et des images de carrousels à leur place. */
  restore: (ids: string[], rels?: string[]) => Promise<void>
  /** Supprime définitivement : les fichiers partent dans la Corbeille Windows et Form oublie les images. */
  purge: (ids: string[]) => Promise<{ deleted: number; failed: number }>
  /** Comme purge, pour des images prises dans des carrousels : seules elles partent, le reste du carrousel reste. */
  purgeFiles: (rels: string[]) => Promise<{ deleted: number; failed: number }>
}

/** Après un changement : la grille, les tableaux et leurs comptes se relisent. */
async function reloadAll() {
  await useGrid.getState().load()
  await useCollections.getState().load()
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

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
    useToast.getState().show(`${plural(ids.length, 'image', 'images')} à la corbeille.`, { label: 'Annuler', run: () => void get().restore(ids) })
  },
  async trashCarouselFiles(rels) {
    if (rels.length === 0) return
    await trashFiles(rels)
    await reloadAll()
    await get().refresh()
    useToast.getState().show(`${plural(rels.length, 'image du carrousel', 'images du carrousel')} à la corbeille.`, { label: 'Annuler', run: () => void get().restore([], rels) })
  },
  async restore(ids, rels = []) {
    if (ids.length === 0 && rels.length === 0) return
    await restoreBlocks(ids)
    await restoreFiles(rels)
    await reloadAll()
    await get().refresh()
    const n = ids.length + rels.length
    useToast.getState().show(`${plural(n, 'image restaurée', 'images restaurées')} : elle${n > 1 ? 's sont' : ' est'} de retour dans la bibliothèque.`)
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
        : `${plural(deleted, 'image supprimée', 'images supprimées')} : fichiers envoyés dans la Corbeille Windows.`,
    )
    return result
  },
  async purgeFiles(rels) {
    const root = useLibrary.getState().root
    if (!root) throw new Error('Le dossier de la bibliothèque est inconnu.')
    const result = await deleteFilesForever(rels, root)
    await reloadAll()
    await get().refresh()
    const { deleted, failed } = result
    useToast.getState().show(
      failed > 0
        ? `${deleted} supprimée${deleted > 1 ? 's' : ''}, ${failed} impossible${failed > 1 ? 's' : ''} (fichier ouvert ailleurs ?).`
        : `${plural(deleted, 'image de carrousel supprimée', 'images de carrousel supprimées')} : fichiers envoyés dans la Corbeille Windows.`,
    )
    return result
  },
}))
