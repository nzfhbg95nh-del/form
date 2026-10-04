import { create } from 'zustand'
import { runDailyBackup } from '@/lib/backup'
import { openRepo } from '@/lib/repo'
import { defaultSchema, parseValues, type Schema } from '@/lib/database'
import { splitCapture } from '@/lib/capture'
import { activateTab, closeTab, currentId, dropTabs, openTab, type Tabs } from '@/lib/tabs'
import { PAGE_TEMPLATES } from '@/lib/templates'
import { tasksSchema } from '@/lib/tasks'
import { computeMove, descendantsOf, duplicationOrder, isDescendant, childrenOf, type DropZone } from '@/lib/tree'
import { withDerivedSiren } from '@/lib/business'
import type { Client, ObjectPatch, ObjectRow, Repo, Service } from '@/lib/types'

export type View = 'page' | 'trash' | 'settings' | 'clients' | 'services'

/** Fiche client ou prestation en cours d'édition (id = null : nouvelle fiche). */
export interface Editing {
  kind: 'client' | 'service'
  id: string | null
}
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

const isPageLike = (o: ObjectRow) => o.type === 'page' || o.type === 'database'

interface AppState {
  repo: Repo | null
  objects: ObjectRow[]
  clients: Client[]
  services: Service[]
  editing: Editing | null
  setEditing(e: Editing | null): void
  saveClient(client: Client): Promise<void>
  saveService(service: Service): Promise<void>
  /** Page affichée = celle de l'onglet actif. */
  selectedId: string | null
  tabs: Tabs
  /** Page ouverte dans le panneau latéral (aperçu). */
  peekId: string | null
  /** Page en cours de renommage dans la barre latérale. */
  renamingId: string | null
  /** Page en cours de déplacement (fenêtre « Déplacer vers »). */
  movingId: string | null
  view: View
  theme: Theme
  error: string | null
  backupMessage: string | null
  expanded: Record<string, boolean>
  searchOpen: boolean
  searchNewTab: boolean
  captureOpen: boolean
  toast: string | null
  setSearch(open: boolean, newTab?: boolean): void
  setCapture(open: boolean): void
  saveCapture(text: string): Promise<void>
  init(): Promise<void>
  select(id: string, opts?: { newTab?: boolean }): void
  activate(index: number): void
  closeTabAt(index: number): void
  openPeek(id: string): void
  closePeek(): void
  setRenaming(id: string | null): void
  setMoving(id: string | null): void
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
  moveTo(id: string, parentId: string | null): Promise<void>
  duplicate(id: string): Promise<void>
  update(id: string, patch: ObjectPatch): Promise<void>
  trash(id: string): Promise<void>
  restore(id: string): Promise<void>
  purge(id: string): Promise<void>
  toggleTheme(): void
}

export const useApp = create<AppState>((set, get) => ({
  repo: null,
  objects: [],
  clients: [],
  services: [],
  editing: null,
  selectedId: null,
  tabs: { ids: [], active: 0 },
  peekId: null,
  renamingId: null,
  movingId: null,
  view: 'page',
  theme: initialTheme(),
  error: null,
  backupMessage: null,
  expanded: savedExpanded(),
  searchOpen: false,
  searchNewTab: false,
  captureOpen: false,
  toast: null,

  async init() {
    applyTheme(get().theme)
    try {
      const repo = await openRepo()
      const objects = await repo.listObjects()
      const [clients, services] = await Promise.all([repo.listClients(), repo.listServices()])
      const first = objects.find((o) => !o.deleted_at && isPageLike(o))
      set({
        repo, objects, clients, services,
        selectedId: first?.id ?? null,
        tabs: first ? { ids: [first.id], active: 0 } : { ids: [], active: 0 },
      })
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

  select(id, opts) {
    // On déplie les pages parentes pour que la page choisie soit visible dans la barre latérale.
    const expanded = { ...get().expanded }
    const seen = new Set<string>()
    for (let p = get().objects.find((o) => o.id === id); p?.parent_id && !seen.has(p.parent_id); p = get().objects.find((o) => o.id === p!.parent_id)) {
      seen.add(p.parent_id)
      expanded[p.parent_id] = true
    }
    localStorage.setItem('form-expanded', JSON.stringify(expanded))
    const tabs = openTab(get().tabs, id, opts?.newTab)
    set({ tabs, selectedId: currentId(tabs), view: 'page', expanded })
  },

  activate(index) {
    const tabs = activateTab(get().tabs, index)
    set({ tabs, selectedId: currentId(tabs), view: 'page' })
  },

  closeTabAt(index) {
    const tabs = closeTab(get().tabs, index)
    set({ tabs, selectedId: currentId(tabs) })
  },

  openPeek(id) {
    set({ peekId: id })
  },
  closePeek() {
    set({ peekId: null })
  },
  setRenaming(id) {
    if (id) {
      // La page doit être visible dans la barre latérale pour être renommée.
      get().select(id)
    }
    set({ renamingId: id })
  },
  setMoving(id) {
    set({ movingId: id })
  },

  setSearch(open, newTab = false) {
    set({ searchOpen: open, searchNewTab: open ? newTab : false, captureOpen: open ? false : get().captureOpen })
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

  setEditing(editing) {
    set({ editing })
  },

  async saveClient(client) {
    const repo = get().repo
    if (!repo) return
    const saved = { ...withDerivedSiren(client), updated_at: new Date().toISOString() }
    await repo.saveClient(saved)
    set((s) => ({
      clients: s.clients.some((c) => c.id === saved.id) ? s.clients.map((c) => (c.id === saved.id ? saved : c)) : [...s.clients, saved],
    }))
  },

  async saveService(service) {
    const repo = get().repo
    if (!repo) return
    const saved = { ...service, updated_at: new Date().toISOString() }
    await repo.saveService(saved)
    set((s) => ({
      services: s.services.some((x) => x.id === saved.id) ? s.services.map((x) => (x.id === saved.id ? saved : x)) : [...s.services, saved],
    }))
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
    set((s) => ({ objects: [...s.objects, page] }))
    get().select(page.id)
  },

  async createDatabase(parentId = null) {
    const repo = get().repo
    if (!repo) return
    const db = await repo.createPage(parentId, 'database', JSON.stringify(defaultSchema()))
    if (parentId) get().toggleExpanded(parentId, true)
    set((s) => ({ objects: [...s.objects, db] }))
    get().select(db.id)
  },

  async createTasks() {
    const repo = get().repo
    if (!repo) return
    const db = await repo.createPage(null, 'database', JSON.stringify(tasksSchema()))
    const patch = { title: 'Tâches', icon: '✅' }
    await repo.updateObject(db.id, patch)
    set((s) => ({ objects: [...s.objects, { ...db, ...patch }] }))
    get().select(db.id)
  },

  async createFromTemplate(templateId) {
    const repo = get().repo
    const tpl = PAGE_TEMPLATES.find((t) => t.id === templateId)
    if (!repo || !tpl) return
    const page = await repo.createPage(null)
    const patch = { title: tpl.title(), icon: tpl.icon, content: JSON.stringify(tpl.content) }
    await repo.updateObject(page.id, patch)
    set((s) => ({ objects: [...s.objects, { ...page, ...patch }] }))
    get().select(page.id)
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

  /** « Déplacer vers… » : met la page à la fin d'une autre page (ou à la racine). */
  async moveTo(id, parentId) {
    const { objects } = get()
    if (id === parentId || (parentId && isDescendant(objects, id, parentId))) return
    const siblings = childrenOf(objects, parentId).filter((o) => o.id !== id)
    const last = siblings[siblings.length - 1]
    await get().update(id, { parent_id: parentId, position: last ? last.position + 1000 : 1000 })
    if (parentId) get().toggleExpanded(parentId, true)
    set({ movingId: null })
  },

  /** Copie une page avec ses sous-pages (et les lignes, pour une base de données). */
  async duplicate(id) {
    const repo = get().repo
    const order = duplicationOrder(get().objects, id)
    if (!repo || order.length === 0) return
    const created = new Map<string, string>()
    for (const [i, src] of order.entries()) {
      const isRoot = i === 0
      const parent = isRoot ? src.parent_id : (created.get(src.parent_id ?? '') ?? null)
      let properties = src.properties
      if (src.type === 'database') {
        // Une relation d'une base vers elle-même doit pointer vers la copie.
        const schema = JSON.parse(src.properties) as Schema
        properties = JSON.stringify({ ...schema, columns: schema.columns.map((c) => (c.targetDb === src.id ? { ...c, targetDb: '__self__' } : c)) })
      }
      const copy = await repo.createPage(parent, src.type, properties)
      created.set(src.id, copy.id)
      if (src.type === 'database') {
        properties = properties.split('__self__').join(copy.id)
      }
      const patch: ObjectPatch = {
        title: isRoot ? `${src.title || 'Sans titre'} (copie)` : src.title,
        icon: src.icon, cover: src.cover, content: src.content,
        properties,
        position: isRoot ? src.position + 1 : src.position,
      }
      await repo.updateObject(copy.id, patch)
      set((s) => ({ objects: [...s.objects, { ...copy, ...patch, is_favorite: 0 } as ObjectRow] }))
    }
    get().select(created.get(id)!)
  },

  async update(id, patch) {
    const repo = get().repo
    if (!repo) return
    await repo.updateObject(id, patch)
    const updated_at = new Date().toISOString()
    set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch, updated_at } : o)) }))
  },

  async trash(id) {
    // La page et toutes ses sous-pages partent ensemble à la corbeille, avec la même date.
    const stamp = new Date().toISOString()
    const ids = [id, ...descendantsOf(get().objects, id).filter((o) => !o.deleted_at).map((o) => o.id)]
    for (const i of ids) await get().update(i, { deleted_at: stamp })
    // Les onglets et l'aperçu qui montraient ces pages se ferment.
    let tabs = dropTabs(get().tabs, ids)
    if (tabs.ids.length === 0) {
      const next = get().objects.find((o) => !o.deleted_at && isPageLike(o))
      if (next) tabs = { ids: [next.id], active: 0 }
    }
    set((s) => ({ tabs, selectedId: currentId(tabs), peekId: s.peekId && ids.includes(s.peekId) ? null : s.peekId }))
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
