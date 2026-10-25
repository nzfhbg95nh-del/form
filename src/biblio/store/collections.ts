import { create } from 'zustand'
import {
  addBlocksToCollection,
  createCollection,
  deleteCollections,
  loadCollections,
  removeBlockFromCollection,
  renameCollection,
  saveOrder,
  saveSettings,
  setCover,
  type CollectionSettings,
  withDescendants,
  type CollectionCard,
} from '@/biblio/lib/collections.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useToast } from '@/biblio/store/toast.ts'

interface CollectionsState {
  cards: CollectionCard[]
  loaded: boolean
  load: () => Promise<void>
  /** Crée une collection (ou un sous-tableau si `parentId`) et rend son identifiant. */
  create: (name: string, parentId?: string | null) => Promise<string>
  rename: (id: string, name: string) => Promise<void>
  /** Supprime la collection et ses sous-collections ; les blocs ne sont pas touchés. */
  remove: (id: string) => Promise<void>
  add: (collectionId: string, blockIds: string[]) => Promise<void>
  removeBlock: (collectionId: string, blockId: string) => Promise<void>
  /** Enregistre le nom, la description et la couverture d'une de mes collections. */
  update: (id: string, settings: CollectionSettings) => Promise<void>
  /** Choisit l'image de couverture d'une de mes collections. */
  cover: (id: string, blockId: string | null) => Promise<void>
  /** Enregistre l'ordre des collections de même parent (après un glisser-déposer). */
  reorder: (ids: string[]) => Promise<void>
}

export const useCollections = create<CollectionsState>((set, get) => {
  /** Relit les cartes et, sauf pour un simple changement d'ordre, les blocs de la collection ouverte. */
  const refresh = async (reload = true) => {
    set({ cards: await loadCollections(), loaded: true })
    const open = useGrid.getState().filters.collection
    if (open && reload) await useGrid.getState().reloadCollection()
  }

  return {
    cards: [],
    loaded: false,
    load: () => refresh(),
    async create(name, parentId = null) {
      const id = await createCollection(name, parentId)
      await refresh()
      return id
    },
    async rename(id, name) {
      await renameCollection(id, name)
      await refresh()
      // Le titre de la collection ouverte suit le nouveau nom.
      const open = useGrid.getState().filters.collection
      if (open?.id === id) useGrid.getState().setFilters({ collection: { ...open, name: name.trim() || open.name } })
    },
    async remove(id) {
      await deleteCollections(withDescendants(get().cards, id))
      const open = useGrid.getState().filters.collection
      if (open && withDescendants(get().cards, id).includes(open.id)) useGrid.getState().setFilters({ collection: null })
      await refresh()
    },
    async add(collectionId, blockIds) {
      await addBlocksToCollection(collectionId, blockIds)
      await refresh()
      const name = get().cards.find((c) => c.id === collectionId)?.name ?? 'la collection'
      useToast.getState().show(`${blockIds.length} image${blockIds.length > 1 ? 's' : ''} ajoutée${blockIds.length > 1 ? 's' : ''} à « ${name} ».`)
    },
    async update(id, settings) {
      await saveSettings(id, settings)
      await refresh(false)
      const open = useGrid.getState().filters.collection
      if (open?.id === id) {
        useGrid.getState().setFilters({ collection: { ...open, name: settings.name.trim() } })
      }
    },
    async cover(id, blockId) {
      await setCover(id, blockId)
      await refresh(false)
      useToast.getState().show(blockId ? 'Couverture changée.' : 'Couverture automatique rétablie.')
    },
    async reorder(ids) {
      await saveOrder(ids)
      await refresh(false)
    },
    async removeBlock(collectionId, blockId) {
      await removeBlockFromCollection(collectionId, blockId)
      await refresh()
    },
  }
})
