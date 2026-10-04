import { create } from 'zustand'
import { runDailyBackup } from '@/lib/backup'
import { openRepo } from '@/lib/repo'
import { defaultSchema, parseValues, type Schema } from '@/lib/database'
import { splitCapture } from '@/lib/capture'
import { PAGE_TEMPLATES } from '@/lib/templates'
import { tasksSchema } from '@/lib/tasks'
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
  searchOpen: boolean
  captureOpen: boolean
  toast: string | null
  setSearch(open: boolean): void
  setCapture(open: boolean): void
  saveCapture(text: string): Promise<void>
  init(): Promise<void>
  select(id: string): void
  show(view: View): void
  toggleExpanded(id: string, value?: boolean): void
  createPage(parentId?: string | null): Promise<void>
  createDatabase(parentId?: string | null): Promise<void>
  createTasks(): Promise<void>
  createFromTemplate(templateId: string): Promise<void>
  createRow(databaseId: string, values?: Record<string, unknown>): Promise<void>
  setCell(rowId: string, colId: string, value: unknown): Promise<void>
  saveSchema(databaseId: string, schema: Schema): Promise<void>
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
  searchOpen: false,
  captureOpen: false,
  toast: null,

  async init() {
    applyTheme(get().theme)
    try {
      const repo = await openRepo()
      const objects = await repo.listObjects()
      const first = objects.find((o) => !o.deleted_at && (o.type === 'page' || o.type === 'database'))
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
    // On déplie les pages parentes pour que la page choisie soit visible dans la barre latérale.
    const expanded = { ...get().expanded }
    const seen = new Set<string>()
    for (let p = get().objects.find((o) => o.id === id); p?.parent_id && !seen.has(p.parent_id); p = get().objects.find((o) => o.id === p!.parent_id)) {
      seen.add(p.parent_id)
      expanded[p.parent_id] = true
    }
    localStorage.setItem('form-expanded', JSON.stringify(expanded))
    set({ selectedId: id, view: 'page', expanded })
  },

  setSearch(open) {
    set({ searchOpen: open, captureOpen: open ? false : get().captureOpen })
  },
  setCapture(open) {
    set({ captureOpen: open, searchOpen: open ? false : get().searchOpen })
  },

  async saveCapture(text) {
    const repo = get().repo
    if (!repo || !text.trim()) return
    // Les captures arrivent dans une page « Boîte de réception », créée au besoin.
    const inboxId = await repo.getSetting('inbox_id')
    let inbox = get().objects.find((o) => o.id === inboxId && !o.deleted_at)
    if (!inbox) {
      const page = await repo.createPage(null)
      const patch = { title: 'Boîte de réception', icon: '📥' }
      await repo.updateObject(page.id, patch)
      await repo.setSetting('inbox_id', page.id)
      inbox = { ...page, ...patch }
      set((s) => ({ objects: [...s.objects, inbox!] }))
    }
    const { title, blocks } = splitCapture(text)
    const note = await repo.createPage(inbox.id)
    const patch = { title, content: blocks.length > 0 ? JSON.stringify(blocks) : null }
    await repo.updateObject(note.id, patch)
    set((s) => ({ objects: [...s.objects, { ...note, ...patch }], captureOpen: false, toast: 'Capture enregistrée dans « Boîte de réception ».' }))
    window.setTimeout(() => set({ toast: null }), 3000)
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

  async createDatabase(parentId = null) {
    const repo = get().repo
    if (!repo) return
    const db = await repo.createPage(parentId, 'database', JSON.stringify(defaultSchema()))
    if (parentId) get().toggleExpanded(parentId, true)
    set((s) => ({ objects: [...s.objects, db], selectedId: db.id, view: 'page' }))
  },

  async createTasks() {
    const repo = get().repo
    if (!repo) return
    const db = await repo.createPage(null, 'database', JSON.stringify(tasksSchema()))
    const patch = { title: 'Tâches', icon: '✅' }
    await repo.updateObject(db.id, patch)
    set((s) => ({ objects: [...s.objects, { ...db, ...patch }], selectedId: db.id, view: 'page' }))
  },

  async createFromTemplate(templateId) {
    const repo = get().repo
    const tpl = PAGE_TEMPLATES.find((t) => t.id === templateId)
    if (!repo || !tpl) return
    const page = await repo.createPage(null)
    const patch = { title: tpl.title(), icon: tpl.icon, content: JSON.stringify(tpl.content) }
    await repo.updateObject(page.id, patch)
    set((s) => ({ objects: [...s.objects, { ...page, ...patch }], selectedId: page.id, view: 'page' }))
  },

  async createRow(databaseId, values) {
    const repo = get().repo
    if (!repo) return
    const row = await repo.createPage(databaseId, 'row', JSON.stringify(values ?? {}))
    set((s) => ({ objects: [...s.objects, row] }))
  },

  async setCell(rowId, colId, value) {
    const row = get().objects.find((o) => o.id === rowId)
    if (!row) return
    if (colId === 'title') return get().update(rowId, { title: String(value ?? '') })
    const values = { ...parseValues(row.properties), [colId]: value }
    await get().update(rowId, { properties: JSON.stringify(values) })
  },

  async saveSchema(databaseId, schema) {
    await get().update(databaseId, { properties: JSON.stringify(schema) })
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
      const next = get().objects.find((o) => !o.deleted_at && (o.type === 'page' || o.type === 'database'))
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
