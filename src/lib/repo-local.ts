import { nextNumber } from './quotes'
import type { AuditEntry, BoardAsset, Client, Invoice, Payment, InvoiceLine, InvoiceStatus, IssueInvoiceInput, IssueQuoteInput, ObjectPatch, ObjectRow, Quote, QuoteLine, QuoteStatus, Repo, Service } from './types'

/** Version « navigateur » : sert uniquement à tester l'interface sans l'app Windows. */
export function createLocalRepo(): Repo {
  const K = 'form-dev-objects'
  const S = 'form-dev-settings'
  const load = (): ObjectRow[] => JSON.parse(localStorage.getItem(K) ?? '[]')
  const save = (r: ObjectRow[]) => localStorage.setItem(K, JSON.stringify(r))
  const settings = (): Record<string, string> => JSON.parse(localStorage.getItem(S) ?? '{}')

  const table = <T extends { id: string }>(key: string) => ({
    list: (): T[] => JSON.parse(localStorage.getItem(key) ?? '[]'),
    upsert(row: T) {
      const rows = this.list()
      const i = rows.findIndex((r) => r.id === row.id)
      if (i >= 0) rows[i] = row
      else rows.push(row)
      localStorage.setItem(key, JSON.stringify(rows))
    },
  })
  const payments = table<Payment>('form-dev-payments')
  const invoices = table<Invoice>('form-dev-invoices')
  const invoiceLines = table<InvoiceLine>('form-dev-invoice-lines')
  const readAudit = (): AuditEntry[] => JSON.parse(localStorage.getItem('form-dev-audit') ?? '[]')
  const addAudit = (e: Omit<AuditEntry, 'id' | 'at'>) => {
    const all = readAudit()
    localStorage.setItem('form-dev-audit', JSON.stringify([...all, { ...e, id: all.length + 1, at: new Date().toISOString() }]))
  }
  const quotes = table<Quote>('form-dev-quotes')
  const quoteLines = table<QuoteLine>('form-dev-quote-lines')
  const clients = table<Client>('form-dev-clients')
  const services = table<Service>('form-dev-services')

  const readAssets = (): BoardAsset[] => JSON.parse(localStorage.getItem('form-dev-assets') ?? '[]')
  const writeAssets = (a: BoardAsset[]) => localStorage.setItem('form-dev-assets', JSON.stringify(a))

  return {
    async insertObject(row: ObjectRow) { save([...load(), row]) },
    async listBoardAssets(boardId: string) { return readAssets().filter((a) => a.board_id === boardId) },
    async saveBoardAsset(asset: BoardAsset) {
      writeAssets([...readAssets().filter((a) => !(a.board_id === asset.board_id && a.id === asset.id)), asset])
    },
    async deleteBoardAssets(boardId: string, ids?: string[]) {
      writeAssets(readAssets().filter((a) => !(a.board_id === boardId && (!ids || ids.includes(a.id)))))
    },
    async copyBoardAssets(fromBoardId: string, toBoardId: string) {
      writeAssets([...readAssets(), ...readAssets().filter((a) => a.board_id === fromBoardId).map((a) => ({ ...a, board_id: toBoardId }))])
    },
    async listPayments() { return payments.list() },
    async addPayment(payment: Payment) {
      const invoice = invoices.list().find((i) => i.id === payment.invoice_id)
      if (!invoice?.number || invoice.kind === 'credit') throw new Error('Un paiement ne peut être enregistré que sur une facture émise (pas sur un avoir).')
      if (payment.amount_cents <= 0) throw new Error('Le montant doit être positif.')
      payments.upsert(payment)
      addAudit({ entity: 'invoice', entity_id: invoice.id, number: invoice.number, action: 'payment', detail: `Paiement de ${(payment.amount_cents / 100).toFixed(2)} EUR reçu le ${payment.paid_on} (${payment.method})` })
    },
    async deletePayment(id: string) {
      const payment = payments.list().find((p) => p.id === id)
      if (!payment) return
      localStorage.setItem('form-dev-payments', JSON.stringify(payments.list().filter((p) => p.id !== id)))
      const invoice = invoices.list().find((i) => i.id === payment.invoice_id)
      addAudit({ entity: 'invoice', entity_id: payment.invoice_id, number: invoice?.number ?? null, action: 'payment_deleted', detail: `Paiement supprimé : ${(payment.amount_cents / 100).toFixed(2)} EUR du ${payment.paid_on} (${payment.method})` })
    },
    async listInvoices() { return invoices.list() },
    async listInvoiceLines() { return invoiceLines.list() },
    async saveInvoiceDraft(invoice: Invoice, lines: InvoiceLine[]) {
      if (invoices.list().find((i) => i.id === invoice.id)?.number) throw new Error('Cette facture est déjà émise : elle ne peut plus être modifiée.')
      invoices.upsert(invoice)
      localStorage.setItem('form-dev-invoice-lines', JSON.stringify([...invoiceLines.list().filter((l) => l.invoice_id !== invoice.id), ...lines]))
    },
    async issueInvoice(input: IssueInvoiceInput) {
      const all = invoices.list()
      const invoice = all.find((i) => i.id === input.id)
      const later = all.some((i) => i.number?.startsWith(input.prefix) && i.issue_date > input.issueDate)
      if (!invoice || invoice.number || later) throw new Error("La facture n'a pas pu être émise : elle est déjà numérotée, ou sa date est antérieure à celle d'une facture déjà émise.")
      const number = nextNumber(input.prefix, all.map((i) => i.number))
      invoices.upsert({ ...invoice, number, status: 'issued', issue_date: input.issueDate, due_date: input.dueDate, snapshot: input.snapshot, updated_at: new Date().toISOString() })
      addAudit({ entity: 'invoice', entity_id: invoice.id, number, action: 'issued', detail: `Facture émise le ${input.issueDate}` })
      return number
    },
    async setInvoiceStatus(id: string, status: Exclude<InvoiceStatus, 'draft'>) {
      const invoice = invoices.list().find((i) => i.id === id)
      if (!invoice?.number) return
      invoices.upsert({ ...invoice, status, updated_at: new Date().toISOString() })
      addAudit({ entity: 'invoice', entity_id: id, number: invoice.number, action: 'status', detail: `${invoice.status} -> ${status}` })
    },
    async deleteDraftInvoice(id: string) {
      if (invoices.list().find((i) => i.id === id)?.number) throw new Error('Une facture émise ne peut pas être supprimée : corrige-la par un avoir.')
      localStorage.setItem('form-dev-invoices', JSON.stringify(invoices.list().filter((i) => i.id !== id)))
      localStorage.setItem('form-dev-invoice-lines', JSON.stringify(invoiceLines.list().filter((l) => l.invoice_id !== id)))
    },
    async listAuditLog(entityId?: string) { return readAudit().filter((e) => !entityId || e.entity_id === entityId) },
    async logAudit(e: { entity: string; entityId: string; number: string | null; action: string; detail: string }) {
      addAudit({ entity: e.entity, entity_id: e.entityId, number: e.number, action: e.action, detail: e.detail })
    },
    async listQuotes() { return quotes.list() },
    async listQuoteLines() { return quoteLines.list() },
    async saveQuoteDraft(quote: Quote, lines: QuoteLine[]) {
      const existing = quotes.list().find((q) => q.id === quote.id)
      if (existing?.number) throw new Error('Ce devis a déjà été envoyé : il ne peut plus être modifié.')
      quotes.upsert(quote)
      localStorage.setItem('form-dev-quote-lines', JSON.stringify([...quoteLines.list().filter((l) => l.quote_id !== quote.id), ...lines]))
    },
    async issueQuote(input: IssueQuoteInput) {
      const all = quotes.list()
      const quote = all.find((q) => q.id === input.id)
      if (!quote || quote.number) throw new Error("Le devis n'a pas pu être envoyé (déjà numéroté ?).")
      const number = nextNumber(input.prefix, all.map((q) => q.number))
      quotes.upsert({ ...quote, number, status: 'sent', issue_date: input.issueDate, valid_until: input.validUntil, snapshot: input.snapshot, updated_at: new Date().toISOString() })
      return number
    },
    async setQuoteStatus(id: string, status: Exclude<QuoteStatus, 'draft'>) {
      const quote = quotes.list().find((q) => q.id === id)
      if (quote?.number) quotes.upsert({ ...quote, status, updated_at: new Date().toISOString() })
    },
    async deleteDraftQuote(id: string) {
      const quote = quotes.list().find((q) => q.id === id)
      if (quote?.number) throw new Error('Un devis numéroté ne peut pas être supprimé.')
      localStorage.setItem('form-dev-quotes', JSON.stringify(quotes.list().filter((q) => q.id !== id)))
      localStorage.setItem('form-dev-quote-lines', JSON.stringify(quoteLines.list().filter((l) => l.quote_id !== id)))
    },
    async listClients() { return clients.list() },
    async saveClient(c: Client) { clients.upsert(c) },
    async deleteClient(id: string) { localStorage.setItem('form-dev-clients', JSON.stringify(clients.list().filter((x) => x.id !== id))) },
    async listServices() { return services.list() },
    async saveService(s: Service) { services.upsert(s) },
    async deleteService(id: string) { localStorage.setItem('form-dev-services', JSON.stringify(services.list().filter((x) => x.id !== id))) },
    async listObjects() { return load() },
    async createPage(parentId: string | null = null, type = 'page', properties = '{}') {
      const t = new Date().toISOString()
      const row: ObjectRow = {
        id: crypto.randomUUID(), type, parent_id: parentId, title: '', icon: null,
        cover: null, properties, content: null, position: Date.now(), is_favorite: 0,
        created_at: t, updated_at: t, deleted_at: null,
      }
      save([...load(), row])
      return row
    },
    async updateObject(id: string, patch: ObjectPatch) {
      save(load().map((r) => (r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } : r)))
    },
    async purgeObject(id: string) { save(load().filter((r) => r.id !== id)) },
    async getSetting(key: string) { return settings()[key] ?? null },
    async setSetting(key: string, value: string) {
      localStorage.setItem(S, JSON.stringify({ ...settings(), [key]: value }))
    },
    async backupTo() { throw new Error("La sauvegarde n'existe que dans l'app Windows.") },
  }
}
