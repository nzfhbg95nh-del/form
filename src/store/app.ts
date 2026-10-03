import { create } from 'zustand'
import { runDailyBackup } from '@/lib/backup'
import { openRepo } from '@/lib/repo'
import { computeMove, descendantsOf, type DropZone } from '@/lib/tree'
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

function savedExpanded(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('form-expanded') ?? '{}')
  } catch {
    return {}
  }
}

interface AppState {
  repo: Repo | null
  objects: ObjectRow[]
  selectedId: string | null
  view: View
  theme: Theme
  error: string | null
  backupMessage: string | null
  expanded: Record<string, boolean>
  init(): Promise<void>
  select(id: string): void
  show(view: View): void
  toggleExpanded(id: string, value?: boolean): void
  createPage(parentId?: string | null): Promise<void>
  move(dragId: string, targetId: string, zone: DropZone): Promise<void>
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
  expanded: savedExpanded(),

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

  toggleExpanded(id, value) {
    const expanded = { ...get().expanded, [id]: value ?? !get().expanded[id] }
    localStorage.setItem('form-expanded', JSON.stringify(expanded))
    set({ expanded })
  },

  async createPage(parentId = null) {
    const repo = get().repo
    if (!repo) return
    const page = await repo.createPage(parentId)
    if (parentId) get().toggleExpanded(parentId, true)
    set((s) => ({ objects: [...s.objects, page], selectedId: page.id, view: 'page' }))
  },

  async move(dragId, targetId, zone) {
    const dest = computeMove(get().objects, dragId, targetId, zone)
    if (!dest) return
    await get().update(dragId, dest)
    if (dest.parent_id) get().toggleExpanded(dest.parent_id, true)
  },

  async update(id, patch) {
    const repo = get().repo
    if (!repo) return
    await repo.updateObject(id, patch)
    set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) }))
  },

  async trash(id) {
    // La page et toutes ses sous-pages partent ensemble à la corbeille, avec la même date.
    const stamp = new Date().toISOString()
    const ids = [id, ...descendantsOf(get().objects, id).filter((o) => !o.deleted_at).map((o) => o.id)]
    for (const i of ids) await get().update(i, { deleted_at: stamp })
    if (ids.includes(get().selectedId ?? '')) {
      const next = get().objects.find((o) => !o.deleted_at && o.type === 'page')
      set({ selectedId: next?.id ?? null })
    }
  },

  async restore(id) {
    const { objects } = get()
    const page = objects.find((o) => o.id === id)
    if (!page) return
    const stamp = page.deleted_at
    const kids = descendantsOf(objects, id).filter((o) => o.deleted_at === stamp)
    // Si le parent est toujours à la corbeille, la page revient à la racine.
    const parent = objects.find((o) => o.id === page.parent_id)
    await get().update(id, { deleted_at: null, ...(parent?.deleted_at ? { parent_id: null } : {}) })
    for (const k of kids) await get().update(k.id, { deleted_at: null })
  },

  async purge(id) {
    const repo = get().repo
    if (!repo) return
    // On supprime d'abord les sous-pages les plus profondes.
    const ids = [...descendantsOf(get().objects, id).map((o) => o.id).reverse(), id]
    for (const i of ids) await repo.purgeObject(i)
    set((s) => ({ objects: s.objects.filter((o) => !ids.includes(o.id)) }))
  },

  toggleTheme() {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('form-theme', theme)
    applyTheme(theme)
    set({ theme })
  },
}))
