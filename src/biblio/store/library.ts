import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { applyLibraryRoot } from '@/biblio/lib/relocate.ts'
import type { LayoutInfo } from '@/biblio/lib/relocatePure.ts'
import { seedAndApplyTypes } from '@/biblio/lib/types.ts'
import { makeVideoThumbs, videosWithoutThumb } from '@/biblio/lib/videoThumbs.ts'
import { applyThumbBatch, DEFAULT_ROOT, getSetting, getStats, setSetting, startThumbs, syncLibrary, type LibraryStats, type SyncResult, type ThumbResult } from '@/biblio/lib/library.ts'

type Phase = 'idle' | 'sync' | 'thumbs'

interface LibraryState {
  ready: boolean
  root: string
  /** Où sont rangés « images ajoutées » et le cache pour le dossier choisi (rien tant que l'appli ne l'a pas lu). */
  layout: LayoutInfo | null
  phase: Phase
  label: string
  done: number
  total: number
  stats: LibraryStats | null
  lastResult: SyncResult | null
  error: string | null
  init: (auto?: boolean) => Promise<void>
  setRoot: (root: string) => Promise<void>
  update: () => Promise<void>
  /** Fait les miniatures des vidéos qui n'en ont pas (la fenêtre lit leur première image ; aucun programme en plus). */
  videoThumbs: () => Promise<void>
}

const EMPTY_STATS: LibraryStats = { blocks: 0, files: 0, collections: 0, missing: 0, thumbsReady: 0, thumbsPending: 0, thumbsFailed: 0 }

let listening = false

export const useLibrary = create<LibraryState>((set, get) => ({
  ready: false,
  root: DEFAULT_ROOT,
  layout: null,
  phase: 'idle',
  label: '',
  done: 0,
  total: 0,
  stats: null,
  lastResult: null,
  error: null,

  async init(auto = false) {
    if (get().ready) return
    const saved = await getSetting('library_root')
    // La bibliothèque choisie décide où sont les images ajoutées à la main et le cache (miniatures, modèle d'IA).
    const layout = await applyLibraryRoot(saved ?? DEFAULT_ROOT)
    set({ root: saved ?? DEFAULT_ROOT, layout, stats: await getStats().catch(() => EMPTY_STATS), ready: true })
    // Les types de départ (dont les nouveaux, comme Céramique et IA) apparaissent dès l'ouverture, sans attendre une mise à jour.
    await seedAndApplyTypes().catch(() => undefined)

    if (!listening) {
      listening = true
      let writing = Promise.resolve()
      await listen<{ results: ThumbResult[]; done: number; total: number }>('thumbs-batch', (e) => {
        set({ phase: 'thumbs', label: 'Miniatures…', done: e.payload.done, total: e.payload.total })
        // Les lots sont écrits dans l'ordre, un à la fois.
        writing = writing.then(() => applyThumbBatch(e.payload.results)).catch(() => undefined)
      })
      await listen('thumbs-done', async () => {
        await writing
        set({ phase: 'idle', label: '', stats: await getStats() })
        // Windows ne sait pas lire les vidéos sans ffmpeg : la fenêtre de l'appli s'en charge ensuite.
        void get().videoThumbs()
      })
    }
    // Détection au démarrage : si le dossier est réglé, on met la bibliothèque à jour sans rien demander.
    if (saved && auto) void get().update()
  },

  async setRoot(root) {
    await setSetting('library_root', root)
    const layout = await applyLibraryRoot(root)
    set({ root, layout })
    // Les miniatures peuvent avoir changé de dossier (cache dans la bibliothèque) : la grille relit son emplacement.
    const { useGrid } = await import('@/biblio/store/grid.ts')
    const wasLoaded = useGrid.getState().loaded
    useGrid.setState({ thumbsDir: '' })
    if (wasLoaded) await useGrid.getState().load()
  },

  async update() {
    const { phase, root } = get()
    if (phase !== 'idle') return
    set({ phase: 'sync', error: null, label: 'Lecture du dossier…', done: 0, total: 0 })
    try {
      await setSetting('library_root', root)
      const result = await syncLibrary(root, (label, done, total) => set({ label, done, total }))
      await seedAndApplyTypes()
      set({ lastResult: result, stats: await getStats() })
      const started = await startThumbs(root)
      if (started) set({ phase: 'thumbs', label: 'Miniatures…', done: 0, total: get().stats?.thumbsPending ?? 0 })
      else {
        set({ phase: 'idle', label: '' })
        void get().videoThumbs()
      }
    } catch (e) {
      set({ phase: 'idle', label: '', error: String(e) })
    }
  },

  async videoThumbs() {
    const { phase, root } = get()
    if (phase !== 'idle' || !root) return
    const total = (await videosWithoutThumb().catch(() => [])).length
    if (total === 0) return
    set({ phase: 'thumbs', label: 'Miniatures des vidéos…', done: 0, total, error: null })
    try {
      await makeVideoThumbs(root, (done, all) => set({ done, total: all }))
    } catch (e) {
      set({ error: String(e) })
    }
    set({ phase: 'idle', label: '', stats: await getStats().catch(() => get().stats) })
    // La grille relit les miniatures toutes neuves.
    const { useGrid } = await import('@/biblio/store/grid.ts')
    if (useGrid.getState().loaded) await useGrid.getState().load()
  },
}))
