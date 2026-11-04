import { create } from 'zustand'
import { runDailyBackup } from '@/lib/backup'
import { openRepo } from '@/lib/repo'
import { agendaSchema, defaultSchema, isSystemDatabase, parseSchema, parseValues, type Schema } from '@/lib/database'
import { activateTab, closeAround, closeTab, currentId, dropTabs, duplicateTab, goInTab, isViewTab, moveTab, openTab, parseViewTab, pinTab, viewTabId, type CloseSide, type Tabs } from '@/lib/tabs'
import { useLibraryNav, type LibraryPageId } from '@/biblio/store/nav'
import { PAGE_TEMPLATES } from '@/lib/templates'
import { tasksSchema } from '@/lib/tasks'
import { parseContent } from '@/lib/content'
import { firstPhotoUrl, withFirstPhoto } from '@/lib/recipeFolder'
import { computeMove, descendantsOf, duplicationOrder, isDescendant, childrenOf, type DropZone } from '@/lib/tree'
import { checkForUpdate, isNewer, type AvailableUpdate } from '@/lib/updates'
import { parsePinned, PINNED_SETTING, togglePinned } from '@/lib/pinned'
import { clientDocumentCount, couturePrestations, defaultServices, withDerivedSiren } from '@/lib/business'
import { defaultCompany, loadCompany, type Company } from '@/lib/company'
import { todayISO } from '@/lib/backup'
import { blockersToSend, buildSnapshot, newLine, newQuote, numberPrefix } from '@/lib/quotes'
import {
  blockersToIssue, buildInvoiceSnapshot, creditFromInvoice, depositFromQuote, finalFromQuote, invoicePrefix, newStandardInvoice,
  type Draft,
} from '@/lib/invoices'
import { emptyRecipeBlocks, normalizeRecipesSchema, RECIPE, recipesSchema } from '@/lib/recipes'
import { isSettled } from '@/lib/payments'
import { applyAccent, loadAccent } from '@/lib/uiPrefs'
import type { Client, Invoice, InvoiceLine, ObjectPatch, Payment, ObjectRow, Quote, QuoteLine, QuoteStatus, Repo, Service } from '@/lib/types'

/** Les pages des Réglages, et les onglets de « Mon entreprise » (pour ouvrir les Réglages au bon endroit). */
export type SettingsPageId = 'general' | 'interface' | 'library' | 'company' | 'notion'
export type CompanyPanelId = 'identity' | 'billing' | 'taxes' | 'reminders' | 'cgv'

export type View = 'home' | 'page' | 'trash' | 'settings' | 'clients' | 'services' | 'quotes' | 'invoices' | 'payments' | 'dashboard' | 'library'

/** L'écran à afficher pour l'onglet actif : une page, ou un écran (et sa page de bibliothèque) pour un onglet « view: ». */
function viewOfTab(t: Tabs): { view: View } {
  const parsed = parseViewTab(t.ids[t.active] ?? '')
  if (!parsed) return { view: 'page' }
  if (parsed.libPage) useLibraryNav.getState().go(parsed.libPage as LibraryPageId)
  return { view: parsed.view as View }
}

/** Fiche client ou prestation en cours d'édition (id = null : nouvelle fiche). */
export interface Editing {
  kind: 'client' | 'service'
  id: string | null
}
export type Theme = 'light' | 'dark'
/** Le choix de thème : clair, sombre, ou « auto » (suit le mode de Windows, y compris quand il change le soir). */
export type ThemeMode = 'light' | 'dark' | 'auto'

function initialThemeMode(): ThemeMode {
  const saved = localStorage.getItem('form-theme')
  return saved === 'light' || saved === 'dark' ? saved : 'auto'
}

function resolveTheme(mode: ThemeMode): Theme {
  if (mode !== 'auto') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  // La couleur d'accent a une variante claire et une variante sombre.
  applyAccent(loadAccent(), theme === 'dark')
}

function savedExpanded(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('form-expanded') ?? '{}')
  } catch {
    return {}
  }
}

/** Dernière page ouverte, gardée pour la rouvrir au prochain démarrage. */
const LAST_PAGE_KEY = 'form-last-page'
const isPageLike = (o: ObjectRow) => o.type === 'page' || o.type === 'database' || o.type === 'moodboard'

interface AppState {
  repo: Repo | null
  objects: ObjectRow[]
  clients: Client[]
  services: Service[]
  company: Company
  quotes: Quote[]
  quoteLines: QuoteLine[]
  /** Devis ouvert dans l'éditeur (null = on voit la liste). */
  openQuoteId: string | null
  invoices: Invoice[]
  invoiceLines: InvoiceLine[]
  openInvoiceId: string | null
  payments: Payment[]
  /** Encaisse un paiement ; la facture passe en « payée » quand tout est réglé. */
  addPayment(payment: Payment): Promise<void>
  deletePayment(id: string): Promise<void>
  openInvoice(id: string | null): void
  createStandardInvoice(): Promise<void>
  createDepositInvoice(quoteId: string): Promise<void>
  createFinalInvoice(quoteId: string): Promise<void>
  createCredit(invoiceId: string): Promise<void>
  saveInvoiceDraft(invoice: Invoice, lines: InvoiceLine[]): Promise<void>
  issueInvoice(id: string): Promise<void>
  deleteDraftInvoice(id: string): Promise<void>
  setCompany(company: Company): void
  openQuote(id: string | null): void
  createQuote(): Promise<void>
  saveQuoteDraft(quote: Quote, lines: QuoteLine[]): Promise<void>
  issueQuote(id: string): Promise<void>
  setQuoteStatus(id: string, status: Exclude<QuoteStatus, 'draft'>): Promise<void>
  deleteDraftQuote(id: string): Promise<void>
  duplicateQuote(id: string): Promise<void>
  editing: Editing | null
  setEditing(e: Editing | null): void
  saveClient(client: Client): Promise<void>
  /** Supprime un client sans devis ni facture. Renvoie un message d'explication si c'est impossible. */
  deleteClient(id: string): Promise<string | null>
  saveService(service: Service): Promise<void>
  deleteService(id: string): Promise<void>
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
  themeMode: ThemeMode
  /** Où ouvrir les Réglages (page, et onglet de « Mon entreprise ») : posé par openSettings, pris par la page des Réglages. */
  settingsTarget: { page: SettingsPageId; panel?: CompanyPanelId } | null
  error: string | null
  backupMessage: string | null
  expanded: Record<string, boolean>
  searchOpen: boolean
  searchNewTab: boolean
  toast: string | null
  setSearch(open: boolean, newTab?: boolean): void
  init(): Promise<void>
  select(id: string, opts?: { newTab?: boolean }): void
  activate(index: number): void
  /** Historique de navigation (flèches Précédent / Suivant). */
  goBack(): void
  goForward(): void
  goInActiveTab(direction: 'back' | 'forward'): void
  /** Onglets fermés récemment, pour « Rouvrir le dernier onglet fermé ». */
  closedTabs: string[]
  reopenTab(): void
  cycleTab(delta: 1 | -1): void
  sidebarHidden: boolean
  toggleSidebar(): void
  /** Vrai (au départ) : la page qu'on quitte reste ouverte dans son onglet et chaque page s'ouvre dans un autre onglet ; faux : une page remplace l'onglet actif, comme dans un navigateur. */
  zoom: number
  setZoom(zoom: number): void
  closeTabAt(index: number): void
  /** Onglets épinglés (à gauche, sans croix, jamais fermés par « fermer les autres »). */
  pinnedTabs: string[]
  duplicateTabAt(index: number): void
  togglePinTab(index: number): void
  /** Glisser-déposer d'un onglet : 	o est sa place une fois déplacé. */
  moveTabTo(from: number, to: number): void
  closeTabsAround(index: number, side: CloseSide): void
  openPeek(id: string): void
  closePeek(): void
  setRenaming(id: string | null): void
  setMoving(id: string | null): void
  show(view: View): void
  /** Ouvre un écran (Devis, Tout, Carte…) dans un nouvel onglet. */
  openViewTab(view: View, libPage?: LibraryPageId): void
  toggleExpanded(id: string, value?: boolean): void
  createPage(parentId?: string | null, newTab?: boolean): Promise<void>
  createDatabase(parentId?: string | null): Promise<void>
  createTasks(): Promise<void>
  createMoodboard(): Promise<void>
  /** Crée un moodboard enfant de la page (sans l'ouvrir) pour l'intégrer dans son contenu ; renvoie son identifiant. */
  createEmbeddedChild(parentId: string | null, kind: 'page' | 'database' | 'moodboard'): Promise<string | null>
  /** Ajoute des recettes lues dans le dossier « recette » (celles dont le titre existe déjà sont laissées telles quelles). */
  importRecipeRows(items: { title: string; icon: string | null; cover: string | null; values: Record<string, unknown>; content: unknown[] }[]): Promise<{ created: number; skipped: number; photos: number }>
  /** Ouvre la base « Recettes » (la crée au premier usage). */
  openRecipes(newTab?: boolean): Promise<void>
  /** Nouvelle recette vide dans la base « Recettes », ouverte aussitôt. */
  addRecipe(values?: Record<string, unknown>, cover?: string): Promise<void>
  /** Relève le courrier reconnu et crée une ligne par nouveau message. Renvoie le nombre de nouveaux courriers. */
  /** Recharge toutes les pages depuis la base (après un import). */
  reloadObjects(): Promise<void>
  /** Ajoute des tâches à une base de tâches (en crée une si dbId est null). */
  /** Moodboards ouverts dans une fenêtre flottante (la fenêtre principale ne les modifie pas en même temps). */
  /** Mise à jour disponible (trouvée automatiquement ou à la demande). */
  availableUpdate: AvailableUpdate | null
  updateDismissed: boolean
  dismissUpdate(): void
  /** Cherche une mise à jour ; renvoie « found », « none » ou le message d'erreur. */
  checkUpdates(): Promise<'found' | 'none' | { error: string }>
  /** Pages épinglées en haut de la barre latérale (identifiants, dans l'ordre). */
  pinned: string[]
  togglePin(id: string): void
  floatingBoards: string[]
  setFloatingBoard(id: string, open: boolean): void
  /** Démarrage léger de la fenêtre flottante : ouvre la base et charge les pages, sans sauvegarde ni rappels. */
  initFloating(): Promise<void>
  /** Ajoute un événement daté à la base « Agenda » (créée au besoin), sans quitter la page. */
  addCalendarEvent(title: string, date: string, time?: string): Promise<void>
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
  setThemeMode(mode: ThemeMode): void
  /** Ouvre les Réglages directement sur la bonne page (et le bon onglet de « Mon entreprise »). */
  openSettings(page: SettingsPageId, panel?: CompanyPanelId): void
  clearSettingsTarget(): void
}

type SetFn = (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void

/** Enregistre un brouillon de facture tout juste construit et l'ouvre dans l'éditeur. */
async function createDraft(set: SetFn, get: () => AppState, draft: Draft) {
  const repo = get().repo
  if (!repo) return
  await repo.saveInvoiceDraft(draft.invoice, draft.lines)
  set((s) => ({
    invoices: [draft.invoice, ...s.invoices],
    invoiceLines: [...s.invoiceLines, ...draft.lines],
    openInvoiceId: draft.invoice.id,
    view: 'invoices',
  }))
}

/** La base « Recettes » (créée au premier usage). */
async function ensureRecipesDb(get: () => AppState, set: SetFn): Promise<ObjectRow | null> {
  const repo = get().repo
  if (!repo) return null
  const existing = get().objects.find((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'recipes')
  if (existing) {
    // Une base créée par une ancienne version perd ses propriétés inutiles (durées, note, étiquettes, source).
    const schema = parseSchema(existing.properties)
    const clean = normalizeRecipesSchema(schema)
    if (clean !== schema) {
      const properties = JSON.stringify(clean)
      await repo.updateObject(existing.id, { properties })
      const updated = { ...existing, properties }
      set((s) => ({ objects: s.objects.map((o) => (o.id === existing.id ? updated : o)) }))
      return updated
    }
    return existing
  }
  const created = await repo.createPage(null, 'database', JSON.stringify(recipesSchema()))
  const patch = { title: 'Recettes', icon: '🍳' }
  await repo.updateObject(created.id, patch)
  const db = { ...created, ...patch }
  set((s) => ({ objects: [...s.objects, db] }))
  return db
}

/** Ajoute une recette (modèle vide si rien n'est fourni) dans la base « Recettes » et l'ouvre. */
async function addRecipeRow(get: () => AppState, set: SetFn, input: { title?: string; values?: Record<string, unknown>; content?: unknown[]; cover?: string }) {
  const repo = get().repo
  const db = await ensureRecipesDb(get, set)
  if (!repo || !db) return
  // Une nouvelle recette part avec le dernier nombre de personnes choisi.
  const people = Math.max(1, parseInt((await repo.getSetting('recipe_people')) ?? '', 10) || 4)
  const values = input.content ? (input.values ?? {}) : { [RECIPE.servings]: people, ...(input.values ?? {}) }
  const row = await repo.createPage(db.id, 'row', JSON.stringify(values))
  const patch = { title: input.title ?? 'Nouvelle recette', icon: null, content: JSON.stringify(input.content ?? emptyRecipeBlocks(people)), ...(input.cover ? { cover: input.cover } : {}) }
  await repo.updateObject(row.id, patch)
  set((s) => ({ objects: [...s.objects, { ...row, ...patch }] }))
  get().select(row.id)
}

/** Ajoute des recettes lues dans le dossier « recette » : celles dont le titre existe déjà ne sont jamais réimportées ni écrasées. Aucune n'est ouverte. */
async function importRecipeRowsInto(
  get: () => AppState,
  set: SetFn,
  items: { title: string; icon: string | null; cover: string | null; values: Record<string, unknown>; content: unknown[] }[],
): Promise<{ created: number; skipped: number; photos: number }> {
  const repo = get().repo
  const db = await ensureRecipesDb(get, set)
  if (!repo || !db) return { created: 0, skipped: items.length, photos: 0 }
  const existing = new Map(get().objects.filter((o) => o.parent_id === db.id && o.type === 'row' && !o.deleted_at).map((o) => [(o.title ?? '').trim().toLowerCase(), o]))
  const known = new Set(existing.keys())
  const added: ObjectRow[] = []
  const photoed: ObjectRow[] = []
  for (const it of items) {
    const key = it.title.trim().toLowerCase()
    // Une recette qui existe déjà n'est jamais écrasée ; seule sa photo manquante est reprise du dossier.
    const mine = existing.get(key)
    if (mine) {
      const photo = firstPhotoUrl(it.content)
      // La photo du dossier devient aussi la couverture (donc la miniature de la carte), comme pour les autres recettes.
      if (photo && !mine.cover) {
        const blocks = parseContent(mine.content) ?? []
        const patch = { cover: photo, ...(firstPhotoUrl(blocks) ? {} : { content: JSON.stringify(withFirstPhoto(blocks, photo)) }) }
        await repo.updateObject(mine.id, patch)
        photoed.push({ ...mine, ...patch })
      }
      continue
    }
    if (!key || known.has(key)) continue
    known.add(key)
    const row = await repo.createPage(db.id, 'row', JSON.stringify(it.values))
    const patch = { title: it.title, icon: it.icon === '🍳' ? null : (it.icon ?? null), content: JSON.stringify(it.content), ...((it.cover || firstPhotoUrl(it.content)) ? { cover: it.cover || firstPhotoUrl(it.content) } : {}) }
    await repo.updateObject(row.id, patch)
    added.push({ ...row, ...patch })
  }
  if (added.length > 0 || photoed.length > 0) {
    const byId = new Map(photoed.map((o) => [o.id, o]))
    set((s) => ({ objects: [...s.objects.map((o) => byId.get(o.id) ?? o), ...added] }))
  }
  return { created: added.length, skipped: items.length - added.length, photos: photoed.length }
}

export const useApp = create<AppState>((set, get) => ({
  repo: null,
  objects: [],
  clients: [],
  services: [],
  company: defaultCompany(),
  quotes: [],
  quoteLines: [],
  openQuoteId: null,
  invoices: [],
  invoiceLines: [],
  openInvoiceId: null,
  payments: [],
  editing: null,
  selectedId: null,
  tabs: { ids: [], active: 0 },
  peekId: null,
  renamingId: null,
  movingId: null,
  view: 'home',
  theme: resolveTheme(initialThemeMode()),
  themeMode: initialThemeMode(),
  settingsTarget: null,
  error: null,
  backupMessage: null,
  expanded: savedExpanded(),
  closedTabs: [],
  pinnedTabs: [],
  sidebarHidden: localStorage.getItem('form-sidebar-hidden') === '1',
  zoom: Number(localStorage.getItem('form-zoom') ?? '1') || 1,
  searchOpen: false,
  searchNewTab: false,
  toast: null,
  floatingBoards: [],
  pinned: [],
  availableUpdate: null,
  updateDismissed: false,

  dismissUpdate() {
    set({ updateDismissed: true })
  },

  async checkUpdates() {
    try {
      const found = await checkForUpdate()
      if (found && isNewer(found.version, __APP_VERSION__)) {
        // Une nouvelle version déjà refusée « plus tard » ne revient pas à chaque vérification de la même session.
        set((s) => ({ availableUpdate: found, updateDismissed: s.availableUpdate?.version === found.version ? s.updateDismissed : false }))
        return 'found'
      }
      set({ availableUpdate: null })
      return 'none'
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  },

  togglePin(id) {
    const next = togglePinned(get().pinned, id)
    set({ pinned: next })
    void get().repo?.setSetting(PINNED_SETTING, JSON.stringify(next))
  },

  setFloatingBoard(id, open) {
    set((s) => ({ floatingBoards: open ? (s.floatingBoards.includes(id) ? s.floatingBoards : [...s.floatingBoards, id]) : s.floatingBoards.filter((x) => x !== id) }))
  },

  async initFloating() {
    applyTheme(get().theme)
    try {
      const repo = await openRepo()
      set({ repo, objects: await repo.listObjects() })
    } catch (e) {
      set({ error: `Impossible d'ouvrir la base de données : ${String(e)}` })
    }
  },

  async init() {
    applyTheme(get().theme)
    if (get().zoom !== 1) document.documentElement.style.zoom = String(get().zoom)
    try {
      const repo = await openRepo()
      const objects = await repo.listObjects()
      const [clients, services, company, quotes, quoteLines, invoices, invoiceLines, payments] = await Promise.all([
        repo.listClients(), repo.listServices(), loadCompany(repo), repo.listQuotes(), repo.listQuoteLines(), repo.listInvoices(), repo.listInvoiceLines(), repo.listPayments(),
      ])
      // Au démarrage, aucun onglet n'est ouvert, sauf la dernière page consultée avant la fermeture (on reste sur l'accueil).
      let last: string | null = null
      try { last = localStorage.getItem(LAST_PAGE_KEY) } catch { /* sans importance */ }
      const first = objects.find((o) => o.id === last && !o.deleted_at && isPageLike(o) && !isSystemDatabase(o))
      // Premier lancement : le catalogue reçoit les tarifs journaliers de Victor (une seule fois, même s'il les supprime ensuite).
      if (services.length === 0 && (await repo.getSetting('default_services_seeded')) !== '1') {
        for (const s of defaultServices()) {
          await repo.saveService(s)
          services.push(s)
        }
        await repo.setSetting('default_services_seeded', '1')
      }
      // Mise à jour 0.26 : la couture (12 €/heure) rejoint le catalogue, une seule fois.
      if ((await repo.getSetting('default_couture_seeded')) !== '1') {
        for (const s of couturePrestations()) {
          if (!services.some((x) => x.id === s.id)) {
            await repo.saveService(s)
            services.push(s)
          }
        }
        await repo.setSetting('default_couture_seeded', '1')
      }
      const pinned = parsePinned(await repo.getSetting(PINNED_SETTING))
      set({
        pinned,
        repo, objects, clients, services, company, quotes, quoteLines, invoices, invoiceLines, payments,
        selectedId: first?.id ?? null,
        // L'accueil a son propre onglet (actif) ; la dernière page consultée reste ouverte à côté.
        tabs: { ids: first ? [viewTabId('home'), first.id] : [viewTabId('home')], active: 0 },
      })
      try {
        await runDailyBackup(repo)
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
    // Comme dans Notion : un clic change le contenu de l'onglet actif ; seuls Ctrl+clic, clic molette, « Nouvel onglet » et le bouton + en ouvrent un autre.
    const keep = opts?.newTab ?? false
    const tabs = openTab(get().tabs, id, keep)
    // L'onglet se souvient de ce qu'il montrait avant : « Précédent » et « Suivant » sont propres à chaque onglet.
    set({ tabs, selectedId: currentId(tabs), view: 'page', expanded })
    const opened = get().objects.find((o) => o.id === currentId(tabs))
    if (opened && isPageLike(opened) && !isSystemDatabase(opened)) {
      try { localStorage.setItem(LAST_PAGE_KEY, opened.id) } catch { /* sans importance */ }
    }
  },

  goBack() {
    get().goInActiveTab('back')
  },

  goForward() {
    get().goInActiveTab('forward')
  },

  goInActiveTab(direction) {
    // Les pages mises à la corbeille ou supprimées sont sautées ; les écrans (Accueil, Devis…) existent toujours.
    const { tabs, objects } = get()
    const next = goInTab(tabs, direction, (id) => isViewTab(id) || objects.some((o) => o.id === id && !o.deleted_at))
    if (!next) return
    set({ tabs: next, selectedId: currentId(next), ...viewOfTab(next) })
  },
  reopenTab() {
    const closed = get().closedTabs
    const id = closed[closed.length - 1]
    if (!id || !get().objects.some((o) => o.id === id && !o.deleted_at)) {
      set({ closedTabs: closed.slice(0, -1) })
      return
    }
    const tabs = openTab(get().tabs, id, true)
    set({ tabs, selectedId: currentId(tabs), view: 'page', closedTabs: closed.slice(0, -1) })
  },

  cycleTab(delta) {
    const { tabs } = get()
    if (tabs.ids.length < 2) return
    const index = (tabs.active + delta + tabs.ids.length) % tabs.ids.length
    const next = activateTab(tabs, index)
    set({ tabs: next, selectedId: currentId(next), ...viewOfTab(next) })
  },

  toggleSidebar() {
    const sidebarHidden = !get().sidebarHidden
    localStorage.setItem('form-sidebar-hidden', sidebarHidden ? '1' : '0')
    set({ sidebarHidden })
  },

  setZoom(zoom) {
    const z = Math.min(2, Math.max(0.5, Math.round(zoom * 100) / 100))
    localStorage.setItem('form-zoom', String(z))
    document.documentElement.style.zoom = z === 1 ? '' : String(z)
    set({ zoom: z })
  },

  activate(index) {
    const tabs = activateTab(get().tabs, index)
    set({ tabs, selectedId: currentId(tabs), ...viewOfTab(tabs) })
  },

  closeTabAt(index) {
    // Comme dans Notion, il reste toujours au moins un onglet.
    if (get().tabs.ids.length <= 1) return
    const closedId = get().tabs.ids[index]
    const tabs = closeTab(get().tabs, index)
    // Fermer l'onglet qu'on regarde : on passe à la page ou à l'écran de l'onglet voisin.
    const wasShown = index === get().tabs.active
    set({ tabs, selectedId: currentId(tabs), ...(wasShown ? viewOfTab(tabs) : {}), closedTabs: closedId ? [...get().closedTabs.slice(-19), closedId] : get().closedTabs, pinnedTabs: get().pinnedTabs.filter((p) => tabs.ids.includes(p)) })
  },

  duplicateTabAt(index) {
    const tabs = duplicateTab(get().tabs, index)
    set({ tabs, selectedId: currentId(tabs), ...viewOfTab(tabs) })
  },

  moveTabTo(from, to) {
    const tabs = moveTab(get().tabs, from, to, get().pinnedTabs)
    if (tabs !== get().tabs) set({ tabs })
  },

  togglePinTab(index) {
    const r = pinTab(get().tabs, index, get().pinnedTabs)
    set({ tabs: r.tabs, pinnedTabs: r.pinned })
  },

  closeTabsAround(index, side) {
    const r = closeAround(get().tabs, index, side, get().pinnedTabs)
    if (r.closed.length === 0) return
    set({ tabs: r.tabs, selectedId: currentId(r.tabs), ...viewOfTab(r.tabs), closedTabs: [...get().closedTabs, ...r.closed].slice(-20), pinnedTabs: get().pinnedTabs.filter((p) => r.tabs.ids.includes(p)) })
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
    set({ searchOpen: open, searchNewTab: open ? newTab : false })
  },

  show(view) {
    // Comme dans Notion : l'écran choisi prend la place du contenu de l'onglet actif (jamais d'onglet qui s'ajoute ou disparaît tout seul).
    if (view === 'page') {
      set({ view })
      return
    }
    const { tabs } = get()
    const id = viewTabId(view, view === 'library' ? useLibraryNav.getState().page : undefined)
    set({ view, tabs: openTab(tabs, id, false), selectedId: null })
  },

  openViewTab(view, libPage) {
    // Nouvel onglet pour un écran : l'onglet actuel reste tel quel.
    if (libPage) useLibraryNav.getState().go(libPage)
    const tabs = openTab(get().tabs, viewTabId(view, view === 'library' ? libPage : undefined), true)
    set({ tabs, selectedId: null, view })
  },

  setEditing(editing) {
    set({ editing })
  },

  setCompany(company) {
    set({ company })
  },

  openInvoice(id) {
    set({ openInvoiceId: id, view: 'invoices' })
  },

  async addPayment(payment) {
    const { repo, invoices, invoiceLines } = get()
    const invoice = invoices.find((i) => i.id === payment.invoice_id)
    if (!repo || !invoice) return
    await repo.addPayment(payment)
    const payments = await repo.listPayments()
    if (invoice.status !== 'paid' && isSettled(invoice, invoices, invoiceLines, payments)) await repo.setInvoiceStatus(invoice.id, 'paid')
    set({ payments, invoices: await repo.listInvoices() })
  },

  async deletePayment(id) {
    const { repo, invoices, invoiceLines, payments: before } = get()
    const payment = before.find((p) => p.id === id)
    if (!repo || !payment) return
    await repo.deletePayment(id)
    const payments = await repo.listPayments()
    const invoice = invoices.find((i) => i.id === payment.invoice_id)
    // Si ce paiement soldait la facture, elle redevient « émise ».
    if (invoice && invoice.status === 'paid' && !isSettled(invoice, invoices, invoiceLines, payments)) await repo.setInvoiceStatus(invoice.id, 'issued')
    set({ payments, invoices: await repo.listInvoices() })
  },

  async createStandardInvoice() {
    await createDraft(set, get, newStandardInvoice(get().company, todayISO()))
  },
  async createDepositInvoice(quoteId) {
    const { quotes, quoteLines, company } = get()
    const quote = quotes.find((q) => q.id === quoteId)
    if (!quote) return
    await createDraft(set, get, depositFromQuote(company, todayISO(), quote, quoteLines.filter((l) => l.quote_id === quoteId)))
  },
  async createFinalInvoice(quoteId) {
    const { quotes, quoteLines, invoices, invoiceLines, company } = get()
    const quote = quotes.find((q) => q.id === quoteId)
    if (!quote) return
    await createDraft(set, get, finalFromQuote(company, todayISO(), quote, quoteLines.filter((l) => l.quote_id === quoteId), invoices, invoiceLines))
  },
  async createCredit(invoiceId) {
    const { invoices, invoiceLines, company } = get()
    const original = invoices.find((i) => i.id === invoiceId)
    if (!original?.number) return
    await createDraft(set, get, creditFromInvoice(company, todayISO(), original, invoiceLines.filter((l) => l.invoice_id === invoiceId)))
  },

  async saveInvoiceDraft(invoice, lines) {
    const repo = get().repo
    if (!repo) return
    const saved = { ...invoice, updated_at: new Date().toISOString() }
    const ordered = lines.map((l, i) => ({ ...l, invoice_id: invoice.id, position: i }))
    await repo.saveInvoiceDraft(saved, ordered)
    set((s) => ({
      invoices: s.invoices.some((i) => i.id === saved.id) ? s.invoices.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...s.invoices],
      invoiceLines: [...s.invoiceLines.filter((l) => l.invoice_id !== saved.id), ...ordered],
    }))
  },

  async issueInvoice(id) {
    const { repo, invoices, invoiceLines, quotes, clients, company } = get()
    const invoice = invoices.find((i) => i.id === id)
    if (!repo || !invoice) return
    const lines = invoiceLines.filter((l) => l.invoice_id === id)
    const client = clients.find((c) => c.id === invoice.client_id)
    const blockers = blockersToIssue(invoice, lines, client, company, { invoices, invoiceLines })
    if (blockers.length > 0 || !client) throw new Error(blockers.join(' '))
    const quoteNumber = quotes.find((q) => q.id === invoice.quote_id)?.number ?? null
    const relatedNumber = invoices.find((i) => i.id === invoice.related_invoice_id)?.number ?? null
    const number = await repo.issueInvoice({
      id,
      prefix: invoicePrefix(invoice.kind, invoice.issue_date),
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      snapshot: buildInvoiceSnapshot(company, client, invoice.issue_date, quoteNumber, relatedNumber),
    })
    set({ invoices: await repo.listInvoices(), toast: `${number} émise.` })
    window.setTimeout(() => set({ toast: null }), 3000)
  },

  async deleteDraftInvoice(id) {
    const repo = get().repo
    if (!repo) return
    await repo.deleteDraftInvoice(id)
    set((s) => ({
      invoices: s.invoices.filter((i) => i.id !== id),
      invoiceLines: s.invoiceLines.filter((l) => l.invoice_id !== id),
      openInvoiceId: s.openInvoiceId === id ? null : s.openInvoiceId,
    }))
  },

  openQuote(id) {
    set({ openQuoteId: id, view: 'quotes' })
  },

  async createQuote() {
    const repo = get().repo
    if (!repo) return
    const quote = newQuote(get().company, todayISO())
    await repo.saveQuoteDraft(quote, [])
    set((s) => ({ quotes: [quote, ...s.quotes], openQuoteId: quote.id, view: 'quotes' }))
  },

  async saveQuoteDraft(quote, lines) {
    const repo = get().repo
    if (!repo) return
    const saved = { ...quote, updated_at: new Date().toISOString() }
    const ordered = lines.map((l, i) => ({ ...l, quote_id: quote.id, position: i }))
    await repo.saveQuoteDraft(saved, ordered)
    set((s) => ({
      quotes: s.quotes.some((q) => q.id === saved.id) ? s.quotes.map((q) => (q.id === saved.id ? saved : q)) : [saved, ...s.quotes],
      quoteLines: [...s.quoteLines.filter((l) => l.quote_id !== saved.id), ...ordered],
    }))
  },

  async issueQuote(id) {
    const { repo, quotes, quoteLines, clients, company } = get()
    const quote = quotes.find((q) => q.id === id)
    if (!repo || !quote) return
    const lines = quoteLines.filter((l) => l.quote_id === id)
    const client = clients.find((c) => c.id === quote.client_id)
    const blockers = blockersToSend(quote, lines, client, company)
    if (blockers.length > 0 || !client) throw new Error(blockers.join(' '))
    const number = await repo.issueQuote({
      id,
      prefix: numberPrefix('D', quote.issue_date),
      issueDate: quote.issue_date,
      validUntil: quote.valid_until,
      snapshot: buildSnapshot(company, client, quote.issue_date),
    })
    const issued = await repo.listQuotes()
    set({ quotes: issued })
    set({ toast: `Devis ${number} envoyé.` })
    window.setTimeout(() => set({ toast: null }), 3000)
  },

  async setQuoteStatus(id, status) {
    const repo = get().repo
    if (!repo) return
    await repo.setQuoteStatus(id, status)
    set({ quotes: await repo.listQuotes() })
  },

  async deleteDraftQuote(id) {
    const repo = get().repo
    if (!repo) return
    await repo.deleteDraftQuote(id)
    set((s) => ({
      quotes: s.quotes.filter((q) => q.id !== id),
      quoteLines: s.quoteLines.filter((l) => l.quote_id !== id),
      openQuoteId: s.openQuoteId === id ? null : s.openQuoteId,
    }))
  },

  async duplicateQuote(id) {
    const { quotes, quoteLines, repo, company } = get()
    const source = quotes.find((q) => q.id === id)
    if (!repo || !source) return
    const fresh = { ...newQuote(company, todayISO()), client_id: source.client_id, title: source.title, deposit_percent: source.deposit_percent, payment_days: source.payment_days, included_revisions: source.included_revisions, notes: source.notes }
    const lines = quoteLines.filter((l) => l.quote_id === id).map((l, i) => ({ ...newLine(fresh.id, i), service_id: l.service_id, label: l.label, description: l.description, quantity_milli: l.quantity_milli, unit: l.unit, unit_price_cents: l.unit_price_cents }))
    await get().saveQuoteDraft(fresh, lines)
    set({ openQuoteId: fresh.id, view: 'quotes' })
  },

  async deleteClient(id) {
    const repo = get().repo
    if (!repo) return 'Base de données indisponible.'
    const { quotes, invoices } = clientDocumentCount(id, get().quotes, get().invoices)
    if (quotes + invoices > 0) {
      const parts = [quotes ? `${quotes} devis` : '', invoices ? `${invoices} facture${invoices > 1 ? 's' : ''}` : ''].filter(Boolean).join(' et ')
      return `Ce client ne peut pas être supprimé : ${parts} ${quotes + invoices > 1 ? 'sont rattachés' : 'est rattaché'} à lui. Supprime d'abord les brouillons ; les documents envoyés ou émis doivent rester lisibles.`
    }
    await repo.deleteClient(id)
    set((s) => ({ clients: s.clients.filter((c) => c.id !== id) }))
    return null
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

  async deleteService(id) {
    const repo = get().repo
    if (!repo) return
    await repo.deleteService(id)
    set((s) => ({ services: s.services.filter((x) => x.id !== id) }))
  },

  toggleExpanded(id, value) {
    const expanded = { ...get().expanded, [id]: value ?? !get().expanded[id] }
    localStorage.setItem('form-expanded', JSON.stringify(expanded))
    set({ expanded })
  },

  async createPage(parentId = null, newTab = false) {
    const repo = get().repo
    if (!repo) return
    const page = await repo.createPage(parentId)
    if (parentId) get().toggleExpanded(parentId, true)
    set((s) => ({ objects: [...s.objects, page] }))
    get().select(page.id, { newTab })
  },

  async createDatabase(parentId = null) {
    const repo = get().repo
    if (!repo) return
    const db = await repo.createPage(parentId, 'database', JSON.stringify(defaultSchema()))
    if (parentId) get().toggleExpanded(parentId, true)
    set((s) => ({ objects: [...s.objects, db] }))
    get().select(db.id)
  },

  async createMoodboard() {
    const repo = get().repo
    if (!repo) return
    const board = await repo.createPage(null, 'moodboard')
    const patch = { title: 'Moodboard', icon: '🖼️' }
    await repo.updateObject(board.id, patch)
    set((s) => ({ objects: [...s.objects, { ...board, ...patch }] }))
    get().select(board.id)
  },

  async createEmbeddedChild(parentId, kind) {
    const repo = get().repo
    if (!repo) return null
    const created = kind === 'database'
      ? await repo.createPage(parentId, 'database', JSON.stringify(defaultSchema()))
      : kind === 'moodboard' ? await repo.createPage(parentId, 'moodboard') : await repo.createPage(parentId)
    const patch = kind === 'moodboard' ? { title: 'Moodboard', icon: '🖼️' } : {}
    if (kind === 'moodboard') await repo.updateObject(created.id, patch)
    if (parentId) get().toggleExpanded(parentId, true)
    set((s) => ({ objects: [...s.objects, { ...created, ...patch }] }))
    return created.id
  },

  async reloadObjects() {
    const repo = get().repo
    if (repo) set({ objects: await repo.listObjects() })
  },

  async openRecipes(newTab = false) {
    const db = await ensureRecipesDb(get, set)
    if (db) get().select(db.id, { newTab })
  },

  async addRecipe(values, cover) {
    await addRecipeRow(get, set, { values, cover })
  },

  async importRecipeRows(items) {
    return importRecipeRowsInto(get, set, items)
  },

  async addCalendarEvent(title, date, time) {
    const repo = get().repo
    if (!repo) return
    let db = get().objects.find((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'agenda')
    if (!db) {
      const created = await repo.createPage(null, 'database', JSON.stringify(agendaSchema()))
      const patch = { title: 'Agenda', icon: '📅' }
      await repo.updateObject(created.id, patch)
      db = { ...created, ...patch }
      const added = db
      set((s) => ({ objects: [...s.objects, added] }))
    }
    // Agenda créé avant l'ajout de l'heure : on ajoute la colonne « Heure » quand il en faut une.
    const schema = parseSchema(db.properties)
    if (time && !schema.columns.some((c) => c.id === 'time')) {
      const columns = [...schema.columns]
      columns.splice(Math.max(1, columns.findIndex((c) => c.id === 'date') + 1), 0, { id: 'time', name: 'Heure', type: 'text' })
      await get().saveSchema(db.id, { ...schema, columns })
    }
    const row = await repo.createPage(db.id, 'row', JSON.stringify(time ? { date, time } : { date }))
    await repo.updateObject(row.id, { title })
    set((s) => ({ objects: [...s.objects, { ...row, title }] }))
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
    if (templateId === 'recette') return get().addRecipe()
    const page = await repo.createPage(null)
    const patch = { title: tpl.title(), icon: tpl.icon, content: JSON.stringify(tpl.content) }
    await repo.updateObject(page.id, patch)
    set((s) => ({ objects: [...s.objects, { ...page, ...patch }] }))
    get().select(page.id)
  },

  async createRow(databaseId, values) {
    const repo = get().repo
    if (!repo) return
    const db = get().objects.find((o) => o.id === databaseId)
    if (db && parseSchema(db.properties).kind === 'recipes') {
      await addRecipeRow(get, set, { values })
      return
    }
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
        title: isRoot ? `${src.title || 'Nouvelle page'} (copie)` : src.title,
        icon: src.icon, cover: src.cover, content: src.content,
        properties,
        position: isRoot ? src.position + 1 : src.position,
      }
      await repo.updateObject(copy.id, patch)
      if (src.type === 'moodboard') await repo.copyBoardAssets(src.id, copy.id)
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
    const wasShown = ids.includes(get().selectedId ?? '')
    let tabs = dropTabs(get().tabs, ids)
    if (tabs.ids.length === 0) tabs = { ids: [viewTabId('home')], active: 0 }
    set((s) => ({ tabs, selectedId: currentId(tabs), ...(wasShown ? viewOfTab(tabs) : {}), peekId: s.peekId && ids.includes(s.peekId) ? null : s.peekId }))
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
    for (const i of ids) {
      await repo.deleteBoardAssets(i)
      await repo.purgeObject(i)
    }
    set((s) => ({ objects: s.objects.filter((o) => !ids.includes(o.id)) }))
  },

  openSettings(page, panel) {
    set({ settingsTarget: { page, panel } })
    get().show('settings')
  },

  clearSettingsTarget() {
    set({ settingsTarget: null })
  },

  setThemeMode(mode) {
    localStorage.setItem('form-theme', mode)
    const theme = resolveTheme(mode)
    applyTheme(theme)
    set({ theme, themeMode: mode })
  },

  toggleTheme() {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('form-theme', theme)
    applyTheme(theme)
    set({ theme, themeMode: theme })
  },
}))

// Thème « Auto » : quand Windows passe en mode sombre ou clair (le soir…), Form suit tout de suite.
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useApp.getState().themeMode !== 'auto') return
    const theme = resolveTheme('auto')
    applyTheme(theme)
    useApp.setState({ theme })
  })
}
