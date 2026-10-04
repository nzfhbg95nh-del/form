import { create } from 'zustand'
import { runDailyBackup } from '@/lib/backup'
import { openRepo } from '@/lib/repo'
import { defaultSchema, parseSchema, parseValues, type Schema } from '@/lib/database'
import { splitCapture } from '@/lib/capture'
import { activateTab, closeTab, currentId, dropTabs, openTab, type Tabs } from '@/lib/tabs'
import { PAGE_TEMPLATES } from '@/lib/templates'
import { tasksSchema, TASK } from '@/lib/tasks'
import { computeMove, descendantsOf, duplicationOrder, isDescendant, childrenOf, type DropZone } from '@/lib/tree'
import { couturePrestations, defaultServices, withDerivedSiren } from '@/lib/business'
import { defaultCompany, loadCompany, type Company } from '@/lib/company'
import { todayISO } from '@/lib/backup'
import { blockersToSend, buildSnapshot, newLine, newQuote, numberPrefix } from '@/lib/quotes'
import {
  blockersToIssue, buildInvoiceSnapshot, creditFromInvoice, depositFromQuote, finalFromQuote, invoicePrefix, newStandardInvoice,
  type Draft,
} from '@/lib/invoices'
import { configProblems, fetchMail, loadMailConfig, mailSchema, newMailItems, rowFromMail } from '@/lib/mail'
import { recipeBlocks, type AiMode, type AiTask, type Recipe } from '@/lib/ai'
import { isSettled } from '@/lib/payments'
import type { Client, Invoice, InvoiceLine, ObjectPatch, Payment, ObjectRow, Quote, QuoteLine, QuoteStatus, Repo, Service } from '@/lib/types'

export type View = 'home' | 'page' | 'trash' | 'settings' | 'clients' | 'services' | 'quotes' | 'invoices' | 'payments' | 'dashboard' | 'mail'

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
  /** Historique de navigation (flèches Précédent / Suivant). */
  navBack: string[]
  navForward: string[]
  goBack(): void
  goForward(): void
  /** Onglets fermés récemment, pour « Rouvrir le dernier onglet fermé ». */
  closedTabs: string[]
  reopenTab(): void
  cycleTab(delta: 1 | -1): void
  sidebarHidden: boolean
  toggleSidebar(): void
  zoom: number
  setZoom(zoom: number): void
  closeTabAt(index: number): void
  openPeek(id: string): void
  closePeek(): void
  setRenaming(id: string | null): void
  setMoving(id: string | null): void
  show(view: View): void
  toggleExpanded(id: string, value?: boolean): void
  createPage(parentId?: string | null, newTab?: boolean): Promise<void>
  createDatabase(parentId?: string | null): Promise<void>
  createTasks(): Promise<void>
  createMoodboard(): Promise<void>
  /** Crée un moodboard enfant de la page (sans l'ouvrir) pour l'intégrer dans son contenu ; renvoie son identifiant. */
  createEmbeddedChild(parentId: string | null, kind: 'page' | 'database' | 'moodboard'): Promise<string | null>
  /** Fenêtre de l'assistant IA : null = fermée. */
  assistantMode: AiMode | null
  setAssistant(mode: AiMode | null): void
  createRecipePage(recipe: Recipe): Promise<void>
  /** Relève le courrier reconnu et crée une ligne par nouveau message. Renvoie le nombre de nouveaux courriers. */
  syncMail(): Promise<number>
  openMail(): Promise<void>
  /** Recharge toutes les pages depuis la base (après un import). */
  reloadObjects(): Promise<void>
  /** Ajoute des tâches à une base de tâches (en crée une si dbId est null). */
  addTasksFromAi(tasks: AiTask[], dbId: string | null): Promise<void>
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

/** Crée la base « Courrier » si elle n'existe pas encore. */
async function ensureMailDb(repo: Repo, set: SetFn): Promise<ObjectRow> {
  const db = await repo.createPage(null, 'database', JSON.stringify(mailSchema()))
  const patch = { title: 'Courrier', icon: '📬' }
  await repo.updateObject(db.id, patch)
  const full = { ...db, ...patch }
  set((s) => ({ objects: [...s.objects, full] }))
  return full
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
  theme: initialTheme(),
  error: null,
  backupMessage: null,
  expanded: savedExpanded(),
  navBack: [],
  navForward: [],
  closedTabs: [],
  sidebarHidden: localStorage.getItem('form-sidebar-hidden') === '1',
  zoom: Number(localStorage.getItem('form-zoom') ?? '1') || 1,
  searchOpen: false,
  searchNewTab: false,
  assistantMode: null,
  captureOpen: false,
  toast: null,

  async init() {
    applyTheme(get().theme)
    if (get().zoom !== 1) document.documentElement.style.zoom = String(get().zoom)
    try {
      const repo = await openRepo()
      const objects = await repo.listObjects()
      const [clients, services, company, quotes, quoteLines, invoices, invoiceLines, payments] = await Promise.all([
        repo.listClients(), repo.listServices(), loadCompany(repo), repo.listQuotes(), repo.listQuoteLines(), repo.listInvoices(), repo.listInvoiceLines(), repo.listPayments(),
      ])
      const first = objects.find((o) => !o.deleted_at && isPageLike(o))
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
      set({
        repo, objects, clients, services, company, quotes, quoteLines, invoices, invoiceLines, payments,
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
    const previous = get().selectedId
    const tabs = openTab(get().tabs, id, opts?.newTab)
    // On retient d'où l'on vient pour que « Précédent » fonctionne (sauf quand on revient en arrière).
    const history = previous && previous !== id && get().view === 'page' ? { navBack: [...get().navBack.slice(-49), previous], navForward: [] } : {}
    set({ tabs, selectedId: currentId(tabs), view: 'page', expanded, ...history })
  },

  goBack() {
    const { navBack, selectedId, tabs } = get()
    const target = navBack[navBack.length - 1]
    if (!target) return
    const next = openTab(tabs, target, false)
    set({ tabs: next, selectedId: currentId(next), view: 'page', navBack: navBack.slice(0, -1), navForward: selectedId ? [...get().navForward, selectedId] : get().navForward })
  },

  goForward() {
    const { navForward, selectedId, tabs } = get()
    const target = navForward[navForward.length - 1]
    if (!target) return
    const next = openTab(tabs, target, false)
    set({ tabs: next, selectedId: currentId(next), view: 'page', navForward: navForward.slice(0, -1), navBack: selectedId ? [...get().navBack, selectedId] : get().navBack })
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
    set({ tabs: next, selectedId: currentId(next), view: 'page' })
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
    set({ tabs, selectedId: currentId(tabs), view: 'page' })
  },

  closeTabAt(index) {
    const closedId = get().tabs.ids[index]
    const tabs = closeTab(get().tabs, index)
    set({ tabs, selectedId: currentId(tabs), closedTabs: closedId ? [...get().closedTabs.slice(-19), closedId] : get().closedTabs })
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

  setAssistant(mode) {
    set({ assistantMode: mode })
  },

  async syncMail() {
    const repo = get().repo
    if (!repo) return 0
    const config = await loadMailConfig(repo)
    const problems = configProblems(config)
    if (problems.length > 0) throw new Error(problems.join(' '))
    const items = await fetchMail(config, true, 100)
    const { objects } = get()
    const db = objects.find((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'mail')
    // Un message déjà classé (même mis à la corbeille) ne revient jamais.
    const known = new Set(objects.filter((o) => o.type === 'row' && o.parent_id === db?.id).map((o) => String(parseValues(o.properties).mid ?? '')))
    const fresh = newMailItems(items, known)
    if (fresh.length === 0) return 0
    const target = db ?? (await ensureMailDb(repo, set))
    for (const m of fresh) {
      const row = rowFromMail(m)
      const created = await repo.createPage(target.id, 'row', JSON.stringify(row.values))
      await repo.updateObject(created.id, { title: row.title })
      set((s) => ({ objects: [...s.objects, { ...created, title: row.title }] }))
    }
    return fresh.length
  },

  async reloadObjects() {
    const repo = get().repo
    if (repo) set({ objects: await repo.listObjects() })
  },

  async openMail() {
    // Le courrier a sa propre vue, comme Clients ou Prestations : ce n'est pas une page.
    set({ view: 'mail' })
  },

  async createRecipePage(recipe) {
    const repo = get().repo
    if (!repo) return
    const page = await repo.createPage(null)
    const patch = { title: recipe.title, icon: '🍳', content: JSON.stringify(recipeBlocks(recipe)) }
    await repo.updateObject(page.id, patch)
    set((s) => ({ objects: [...s.objects, { ...page, ...patch }] }))
    get().select(page.id)
  },

  async addTasksFromAi(tasks, dbId) {
    const repo = get().repo
    if (!repo) return
    let target = dbId
    if (!target) {
      const db = await repo.createPage(null, 'database', JSON.stringify(tasksSchema()))
      const patch = { title: 'Tâches', icon: '✅' }
      await repo.updateObject(db.id, patch)
      set((s) => ({ objects: [...s.objects, { ...db, ...patch }] }))
      target = db.id
    }
    for (const t of tasks) {
      const values: Record<string, unknown> = { [TASK.status]: 'afaire' }
      if (t.due) values[TASK.due] = t.due
      if (t.priority) values[TASK.priority] = t.priority === 'haute' ? 'haute' : t.priority === 'moyenne' ? 'moyenne' : 'basse'
      const row = await repo.createPage(target, 'row', JSON.stringify(values))
      await repo.updateObject(row.id, { title: t.title })
      set((s) => ({ objects: [...s.objects, { ...row, title: t.title }] }))
    }
    get().select(target)
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
    for (const i of ids) {
      await repo.deleteBoardAssets(i)
      await repo.purgeObject(i)
    }
    set((s) => ({ objects: s.objects.filter((o) => !ids.includes(o.id)) }))
  },

  toggleTheme() {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('form-theme', theme)
    applyTheme(theme)
    set({ theme })
  },
}))
