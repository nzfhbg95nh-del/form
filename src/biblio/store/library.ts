import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { setAjoutsDir } from '@/biblio/lib/media.ts'
import { seedAndApplyTypes } from '@/biblio/lib/types.ts'
import { applyThumbBatch, DEFAULT_ROOT, getSetting, getStats, setSetting, startThumbs, syncLibrary, type LibraryStats, type SyncResult, type ThumbResult } from '@/biblio/lib/library.ts'

type Phase = 'idle' | 'sync' | 'thumbs'

interface LibraryState {
  ready: boolean
  root: string
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
}

const EMPTY_STATS: LibraryStats = { blocks: 0, files: 0, collections: 0, missing: 0, thumbsReady: 0, thumbsPending: 0, thumbsFailed: 0 }

let listening = false

export const useLibrary = create<LibraryState>((set, get) => ({
  ready: false,
  root: DEFAULT_ROOT,
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
    // Le dossier des images ajoutées à la main (pour retrouver leurs fichiers).
    await invoke<string>('ajouts_dir').then(setAjoutsDir).catch(() => undefined)
    set({ root: saved ?? DEFAULT_ROOT, stats: await getStats().catch(() => EMPTY_STATS), ready: true })

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
      })
    }
    // Détection au démarrage : si le dossier est réglé, on met la bibliothèque à jour sans rien demander.
    if (saved && auto) void get().update()
  },

  async setRoot(root) {
    await setSetting('library_root', root)
    set({ root })
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
      else set({ phase: 'idle', label: '' })
    } catch (e) {
      set({ phase: 'idle', label: '', error: String(e) })
    }
  },
}))
