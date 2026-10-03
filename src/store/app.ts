import { create } from 'zustand'
import { runDailyBackup } from '@/lib/backup'
import { openRepo } from '@/lib/repo'
import type { ObjectPatch, ObjectRow, Repo } from '@/lib/types'

export type View = 'page' | 'trash' | 'settings'
export type Theme = 'light' | 'dark'

function initialTheme(): Theme {
  const saved = localStorage.getItem('form-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

interface AppState {
  repo: Repo | null
  objects: ObjectRow[]
  selectedId: string | null
  view: View
  theme: Theme
  error: string | null
  backupMessage: string | null
  init(): Promise<void>
  select(id: string): void
  show(view: View): void
  createPage(): Promise<void>
  update(id: string, patch: ObjectPatch): Promise<void>
  trash(id: string): Promise<void>
  restore(id: string): Promise<void>
  purge(id: string): Promise<void>
  toggleTheme(): void
}

export const useApp = create<AppState>((set, get) => ({
  repo: null,
  objects: [],
  selectedId: null,
  view: 'page',
  theme: initialTheme(),
  error: null,
  backupMessage: null,

  async init() {
    applyTheme(get().theme)
    try {
      const repo = await openRepo()
      const objects = await repo.listObjects()
      const first = objects.find((o) => !o.deleted_at)
      set({ repo, objects, selectedId: first?.id ?? null })
      try {
        const done = await runDailyBackup(repo)
        if (done) set({ backupMessage: `Sauvegarde du ${done} effectuée.` })
      } catch (e) {
        set({ backupMessage: `La sauvegarde automatique a échoué : ${String(e)}` })
      }
    } catch (e) {
      set({ error: `Impossible d'ouvrir la base de données : ${String(e)}` })
    }
  },

  select(id) {
    set({ selectedId: id, view: 'page' })
  },
  show(view) {
    set({ view })
  },

  async createPage() {
    const repo = get().repo
    if (!repo) return
    const page = await repo.createPage()
    set((s) => ({ objects: [...s.objects, page], selectedId: page.id, view: 'page' }))
  },

  async update(id, patch) {
    const repo = get().repo
    if (!repo) return
    await repo.updateObject(id, patch)
    set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) }))
  },

  async trash(id) {
    await get().update(id, { deleted_at: new Date().toISOString() })
    if (get().selectedId === id) {
      const next = get().objects.find((o) => !o.deleted_at)
      set({ selectedId: next?.id ?? null })
    }
  },
  async restore(id) {
    await get().update(id, { deleted_at: null })
  },
  async purge(id) {
    const repo = get().repo
    if (!repo) return
    await repo.purgeObject(id)
    set((s) => ({ objects: s.objects.filter((o) => o.id !== id) }))
  },

  toggleTheme() {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('form-theme', theme)
    applyTheme(theme)
    set({ theme })
  },
}))
