import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { loadBlocks, type GridBlock } from '@/biblio/lib/blocks.ts'
import { loadCollectionBlocks, loadSubBlocks } from '@/biblio/lib/collections.ts'
import { loadColorIndex, type ColorIndex } from '@/biblio/lib/colors.ts'
import { EMPTY_FILTERS, filterBlocks, withOpeningShuffle, type Filters } from '@/biblio/lib/filters.ts'
import { getTextStatus, textVectors } from '@/biblio/lib/aiText.ts'
import { getSearchIndex } from '@/biblio/lib/searchIndex.ts'
import { isSearchable, searchPrompts } from '@/biblio/lib/searchText.ts'
import { averageVector, bestPerBlock, pickMatches } from '@/biblio/lib/semanticSearch.ts'
import { EMPTY_TYPE_INDEX, loadTypeIndex, type TypeIndex } from '@/biblio/lib/types.ts'

const SIZE_KEY = 'klippr.gridSize'
export const SIZE_MIN = 120
export const SIZE_MAX = 420

function savedSize(): number {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY))
    if (n >= SIZE_MIN && n <= SIZE_MAX) return n
  } catch {
    /* préférence non lue : taille par défaut */
  }
  return 220
}

const newSeed = () => Math.floor(Math.random() * 2147483646) + 1

interface GridState {
  /** Tous les blocs. */
  blocks: GridBlock[]
  /** Les blocs qui passent la recherche et les filtres : c'est ce que montrent la grille et la vue détail. */
  shown: GridBlock[]
  filters: Filters
  /** Le tirage au sort de l'ouverture de la page « Tout » (refait à chaque ouverture). */
  seed: number
  /** Remet les images de la page « Tout » dans un nouvel ordre au hasard. */
  reshuffle: () => void
  typeIndex: TypeIndex
  /** Couleurs dominantes de chaque bloc (vide tant qu'elles ne sont pas calculées). */
  colors: ColorIndex
  /** Les blocs de la collection ouverte (quand un filtre de collection est actif). */
  collectionBlocks: ReadonlySet<string> | null
  /** Les blocs rangés dans les sous-tableaux de la collection ouverte. */
  subBlocks: ReadonlySet<string> | null
  /** Images qui ressemblent à la requête (identifiant → ressemblance), ou vide quand il n'y a pas de recherche par contenu. */
  semantic: ReadonlyMap<string, number> | null
  /** Une recherche par contenu est en cours de calcul. */
  searching: boolean
  loaded: boolean
  thumbsDir: string
  size: number
  /** Bloc ouvert dans la vue détail. */
  openId: string | null
  /** Blocs sélectionnés dans la grille (pour les ranger d'un coup). */
  selected: ReadonlySet<string>
  /** Dernier bloc cliqué : le point de départ d'une sélection de Maj+clic. */
  anchor: string | null
  /** `toggle` : ajoute ou retire ce bloc ; `range` : tous les blocs entre le dernier cliqué et celui-ci. */
  selectBlock: (id: string, mode: 'toggle' | 'range') => void
  clearSelection: () => void
  /** Mode « Organiser » : un clic sur une vignette la sélectionne au lieu de l'ouvrir. */
  organize: boolean
  setOrganize: (on: boolean) => void
  load: () => Promise<void>
  loadTypes: () => Promise<void>
  loadColors: () => Promise<void>
  /** Relit les blocs de la collection ouverte (après un rangement). */
  reloadCollection: () => Promise<void>
  setFilters: (patch: Partial<Filters>) => void
  clearFilters: () => void
  setSize: (n: number) => void
  open: (id: string | null) => void
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchToken = 0

/** Cherche par contenu ce que la requête décrit (« t-shirt », « chaise rouge »…) ; sans modèle de texte, rien (la recherche par nom reste). */
async function searchByContent(query: string): Promise<ReadonlyMap<string, number> | null> {
  if (!isSearchable(query) || !(await getTextStatus()).ready) return null
  const index = await getSearchIndex()
  if (index.ids.length === 0) return null
  const vectors = await textVectors(searchPrompts(query))
  const queryVector = averageVector([...vectors.values()])
  return pickMatches(bestPerBlock(queryVector, index.matrix, index.dim, index.blockOf, index.ids.length), index.ids)
}

export const useGrid = create<GridState>((set, get) => {
  /** Recalcule la liste affichée avec l'état actuel (blocs, filtres, tags, types, recherche par contenu). */
  const recompute = (patch: Partial<GridState> = {}) => {
    const s = { ...get(), ...patch }
    set({ ...patch, shown: filterBlocks(s.blocks, withOpeningShuffle(s.filters, s.seed), s.typeIndex, s.semantic, s.colors, s.collectionBlocks, s.subBlocks) })
  }

  return {
    blocks: [],
    shown: [],
    filters: EMPTY_FILTERS,
    seed: newSeed(),
    reshuffle: () => recompute({ seed: newSeed() }),
    typeIndex: EMPTY_TYPE_INDEX,
    colors: new Map(),
    collectionBlocks: null,
    subBlocks: null,
    semantic: null,
    searching: false,
    loaded: false,
    thumbsDir: '',
    size: savedSize(),
    openId: null,
    selected: new Set<string>(),
    anchor: null,
    organize: false,

    async load() {
      const [blocks, typeIndex, colors, thumbsDir] = await Promise.all([
        loadBlocks(),
        loadTypeIndex(),
        loadColorIndex(),
        get().thumbsDir ? Promise.resolve(get().thumbsDir) : invoke<string>('thumbs_dir'),
      ])
      recompute({ blocks, typeIndex, colors, thumbsDir, loaded: true })
    },
    async loadTypes() {
      recompute({ typeIndex: await loadTypeIndex() })
    },
    async reloadCollection() {
      const open = get().filters.collection
      if (open) {
        const [collectionBlocks, subBlocks] = await Promise.all([loadCollectionBlocks(open.id), loadSubBlocks(open.id)])
        recompute({ collectionBlocks, subBlocks })
      }
    },
    async loadColors() {
      recompute({ colors: await loadColorIndex() })
    },
    setFilters(patch) {
      // Ouvrir une collection : on lit d'abord ses blocs, puis on applique le filtre (sinon la grille clignoterait vide).
      if ('collection' in patch && patch.collection?.id !== get().filters.collection?.id) {
        const target = patch.collection ?? null
        if (!target) {
          recompute({ filters: { ...get().filters, ...patch, collectionRest: false }, collectionBlocks: null, subBlocks: null })
        } else {
          void Promise.all([loadCollectionBlocks(target.id), loadSubBlocks(target.id)]).then(([blocks, subs]) => {
            if (get().filters.collection?.id === target.id) return
            // Avec des sous-tableaux, on montre d'abord les images qui ne sont dans aucun d'eux, comme Pinterest.
            recompute({ filters: { ...get().filters, collection: target, collectionRest: subs.size > 0 }, collectionBlocks: blocks, subBlocks: subs })
          })
        }
        const { collection: _ignored, ...rest } = patch
        void _ignored
        if (Object.keys(rest).length === 0) return
        patch = rest
      }
      const filters = { ...get().filters, ...patch }
      const queryChanged = 'query' in patch && patch.query !== get().filters.query
      // Une requête vidée ou trop courte efface tout de suite le contenu trouvé ; sinon on garde l'ancien jusqu'au nouveau calcul.
      recompute({ filters, ...(queryChanged && !isSearchable(filters.query) ? { semantic: null, searching: false } : {}) })
      if (!queryChanged || !isSearchable(filters.query)) return
      clearTimeout(searchTimer)
      const token = ++searchToken
      set({ searching: true })
      searchTimer = setTimeout(() => {
        void searchByContent(filters.query)
          .catch(() => null)
          .then((semantic) => {
            if (token !== searchToken) return // une requête plus récente a pris le relais
            recompute({ semantic, searching: false })
          })
      }, 350)
    },
    clearFilters() {
      clearTimeout(searchTimer)
      searchToken++
      recompute({ filters: EMPTY_FILTERS, semantic: null, searching: false, collectionBlocks: null, subBlocks: null })
    },
    setSize(size) {
      try {
        localStorage.setItem(SIZE_KEY, String(size))
      } catch {
        /* sans conséquence */
      }
      set({ size })
    },
    selectBlock(id, mode) {
      const { shown, selected, anchor } = get()
      const next = new Set(selected)
      if (mode === 'range' && anchor) {
        const a = shown.findIndex((b) => b.id === anchor)
        const b = shown.findIndex((x) => x.id === id)
        if (a >= 0 && b >= 0) for (const blk of shown.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(blk.id)
        else next.add(id)
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      set({ selected: next, anchor: id })
    },
    clearSelection: () => set({ selected: new Set<string>(), anchor: null }),
    setOrganize: (organize) => set(organize ? { organize } : { organize, selected: new Set<string>(), anchor: null }),
    open: (openId) => set({ openId }),
  }
})