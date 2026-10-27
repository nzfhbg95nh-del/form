import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { colorCounts, saveColors, startColors, type ColorResult } from '@/biblio/lib/colors.ts'
import { ocrCounts, saveOcr, startOcr, startRecipeOcr, type OcrResult } from '@/biblio/lib/ocr.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { downloadModel, embeddingCounts, getAiStatus, saveEmbeddings, startEmbeddings, type AiStatus, type EmbedResult } from '@/biblio/lib/ai.ts'
import { downloadText, getTextStatus, type TextStatus } from '@/biblio/lib/aiText.ts'
import { CLASSIFY_VERSION, classifyAll, countUnclassified, type ClassifyRun } from '@/biblio/lib/classifyRun.ts'
import { getSetting, setSetting } from '@/biblio/lib/library.ts'
import { resetSearchIndex } from '@/biblio/lib/searchIndex.ts'
import { DEFAULT_OPTIONS } from '@/biblio/lib/neighbours.ts'
import { clearAutoTypes } from '@/biblio/lib/types.ts'
import { placeAddedImages, placedMessage } from '@/biblio/lib/autoPlaceRun.ts'
import { useCollections } from '@/biblio/store/collections.ts'
import { useToast } from '@/biblio/store/toast.ts'
import { useGrid } from '@/biblio/store/grid.ts'

interface AiState {
  ready: boolean
  status: AiStatus | null
  dlDone: number
  dlTotal: number
  embedDone: number
  embedTotal: number
  embedded: number
  pending: number
  provider: string | null
  failed: number
  lastRun: { seconds: number; provider: string | null } | null
  error: string | null
  classifying: boolean
  classDone: number
  classTotal: number
  lastClassify: ClassifyRun | null
  /** Confiance minimale (0 à 1) pour qu'une image hors tableau reçoive un type de l'IA ; en dessous : « Autres ». */
  threshold: number
  /** Modèle de texte (descriptions de types). */
  text: TextStatus | null
  textDone: number
  /** Couleurs dominantes : images faites / restantes. */
  colorsDone: number
  /** Texte des vidéos : vidéos lues, dont celles où du texte a été trouvé, et celles qui restent. */
  ocrDone: number
  ocrWithText: number
  ocrPending: number
  colorsPending: number
  init: (run?: boolean) => Promise<void>
  refresh: () => Promise<void>
  download: () => Promise<void>
  downloadText: () => Promise<void>
  embed: () => Promise<void>
  refreshColors: () => Promise<void>
  refreshOcr: () => Promise<void>
  computeOcr: () => Promise<void>
  /** Relecture détaillée des vidéos de recettes (une image toutes les 2 secondes). */
  computeRecipeOcr: () => Promise<void>
  computeColors: () => Promise<void>
  /** Refait le classement automatique (types décrits en mots + « Autres »). */
  classify: () => Promise<void>
  clearAuto: () => Promise<number>
  setThreshold: (value: number) => Promise<void>
}

let listening = false

export const useAi = create<AiState>((set, get) => ({
  ready: false,
  status: null,
  dlDone: 0,
  dlTotal: 0,
  embedDone: 0,
  embedTotal: 0,
  embedded: 0,
  pending: 0,
  provider: null,
  failed: 0,
  lastRun: null,
  error: null,
  classifying: false,
  classDone: 0,
  classTotal: 0,
  lastClassify: null,
  threshold: DEFAULT_OPTIONS.threshold,
  text: null,
  textDone: 0,
  colorsDone: 0,
  ocrDone: 0,
  ocrWithText: 0,
  ocrPending: 0,
  colorsPending: 0,

  async init(run = true) {
    if (get().ready) return
    await get().refresh()
    const saved = Number(await getSetting('ai_threshold'))
    set({ ready: true, threshold: saved >= 0.2 && saved <= 0.95 ? saved : DEFAULT_OPTIONS.threshold })
    if (listening) return
    listening = true

    await listen<{ done: number; total: number }>('ai-download', (e) => set({ dlDone: e.payload.done, dlTotal: e.payload.total }))
    await listen<{ ok: boolean; error: string | null }>('ai-download-done', async (e) => {
      await get().refresh()
      if (e.payload.ok) void get().embed() // le modèle est là : on calcule tout de suite les empreintes
      else set({ error: e.payload.error })
    })
    await listen<{ done: number; total: number }>('ai-text-download', (e) => set({ textDone: e.payload.done }))
    await listen<{ ok: boolean; error: string | null }>('ai-text-download-done', async (e) => {
      await get().refresh()
      if (e.payload.ok) void get().classify() // le modèle de texte est là : Typo et Recette sont cherchés dans toutes les images
      else set({ error: e.payload.error })
    })
    await listen<string>('ai-provider', (e) => set({ provider: e.payload }))

    let writing = Promise.resolve()
    await listen<{ results: EmbedResult[]; failed: string[]; done: number; total: number }>('ai-batch', (e) => {
      set((s) => ({ embedDone: e.payload.done, embedTotal: e.payload.total, failed: s.failed + e.payload.failed.length }))
      writing = writing.then(() => saveEmbeddings(e.payload.results)).catch(() => undefined)
    })
    await listen<{ error: string | null; provider: string | null; seconds: number }>('ai-done', async (e) => {
      await writing
      set({ error: e.payload.error, lastRun: e.payload.error ? null : { seconds: e.payload.seconds, provider: e.payload.provider } })
      await get().refresh()
      resetSearchIndex() // de nouvelles empreintes : la recherche par contenu les relira
      // De nouvelles images ont leur empreinte : on les cherche parmi les types décrits en mots.
      if (!e.payload.error && get().pending === 0 && get().embedTotal > 0) void get().classify()
    })
    // Couleurs dominantes : calculées sur les miniatures, sans modèle ni téléchargement.
    let colorWriting = Promise.resolve()
    await listen<{ results: ColorResult[] }>('colors-batch', (e) => {
      colorWriting = colorWriting.then(() => saveColors(e.payload.results)).catch(() => undefined)
    })
    await listen('colors-done', async () => {
      await colorWriting
      await get().refreshColors()
      await useGrid.getState().loadColors()
    })
    // Texte lu dans les vidéos (recettes…) : par la lecture de texte de Windows, sans rien télécharger.
    let ocrWriting = Promise.resolve()
    await listen<{ results: OcrResult[] }>('ocr-batch', (e) => {
      ocrWriting = ocrWriting.then(() => saveOcr(e.payload.results)).catch(() => undefined)
    })
    await listen<{ error: string | null }>('ocr-done', async (e) => {
      await ocrWriting
      if (e.payload.error) set({ error: e.payload.error })
      await get().refreshOcr()
      await useGrid.getState().load()
    })
    // Quand des miniatures viennent d'être finies, on calcule les empreintes et les couleurs manquantes.
    await listen('thumbs-done', () => {
      void get().embed()
      void get().computeColors()
      void get().computeOcr()
    })
    // `run` : lancer tout de suite les calculs en retard (désactivé quand la mise à jour automatique est coupée).
    if (!run) return
    void get().embed()
    void get().computeColors()
    void get().computeOcr()

    // Les images ajoutées à la main qui n'ont pas encore été rangées (par exemple ajoutées pendant que l'IA n'était pas prête).
    void placeAddedImages().then(async (placed) => {
      if (placed.length === 0) return
      await useCollections.getState().load()
      useToast.getState().show(placedMessage(placed))
    }).catch(() => undefined)

    // Le classement est refait au démarrage quand la règle a changé, ou quand des images n'ont encore aucun type.
    const version = await getSetting('classify_version')
    if (version !== CLASSIFY_VERSION || (await countUnclassified()) > 0) void get().classify()
  },

  async refreshColors() {
    const counts = await colorCounts()
    set({ colorsDone: counts.done, colorsPending: counts.pending })
  },

  async refreshOcr() {
    const counts = await ocrCounts()
    set({ ocrDone: counts.done, ocrWithText: counts.withText, ocrPending: counts.pending })
  },

  async computeRecipeOcr() {
    try {
      await startRecipeOcr(useLibrary.getState().root)
    } catch (e) {
      set({ error: String(e) })
    }
  },

  async computeOcr() {
    try {
      await startOcr(useLibrary.getState().root)
    } catch (e) {
      set({ error: String(e) })
    }
    await get().refreshOcr()
  },

  async computeColors() {
    try {
      await startColors()
    } catch (e) {
      set({ error: String(e) })
    }
    await get().refreshColors()
  },

  async refresh() {
    const [status, counts, text] = await Promise.all([getAiStatus(), embeddingCounts(), getTextStatus()])
    set({ status, embedded: counts.embedded, pending: counts.pending, text })
  },

  async download() {
    set({ error: null, dlDone: 0, dlTotal: get().status?.model_size ?? 0 })
    const started = await downloadModel()
    if (started) set((s) => ({ status: s.status ? { ...s.status, downloading: true } : s.status }))
  },

  async downloadText() {
    set({ error: null, textDone: 0 })
    const started = await downloadText()
    if (started) set((s) => ({ text: s.text ? { ...s.text, downloading: true } : s.text }))
  },

  async classify() {
    if (get().classifying) return
    set({ classifying: true, error: null, classDone: 0, classTotal: 0 })
    try {
      const run = await classifyAll(get().threshold, (done, total) => set({ classDone: done, classTotal: total }))
      await setSetting('classify_version', CLASSIFY_VERSION)
      set({ lastClassify: run })
      await useGrid.getState().loadTypes()
      // Les images ajoutées à la main : l'IA les range dans la collection de leurs voisines.
      const placed = await placeAddedImages().catch(() => [])
      if (placed.length > 0) {
        await useCollections.getState().load()
        useToast.getState().show(placedMessage(placed))
      }
    } catch (e) {
      set({ error: String(e) })
    } finally {
      set({ classifying: false })
    }
  },

  async setThreshold(value) {
    set({ threshold: value })
    await setSetting('ai_threshold', String(value))
  },

  async clearAuto() {
    const n = await clearAutoTypes()
    await useGrid.getState().loadTypes()
    return n
  },

  async embed() {
    const { status } = get()
    if (!status?.model_ready) return
    set({ error: null, failed: 0, embedDone: 0, embedTotal: 0 })
    try {
      const started = await startEmbeddings()
      if (started) set((s) => ({ status: s.status ? { ...s.status, embedding: true } : s.status }))
    } catch (e) {
      set({ error: String(e) })
    }
  },
}))
