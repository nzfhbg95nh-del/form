import { nextNumber } from './quotes'
import type { Client, IssueQuoteInput, ObjectPatch, ObjectRow, Quote, QuoteLine, QuoteStatus, Repo, Service } from './types'

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
  const quotes = table<Quote>('form-dev-quotes')
  const quoteLines = table<QuoteLine>('form-dev-quote-lines')
  const clients = table<Client>('form-dev-clients')
  const services = table<Service>('form-dev-services')

  return {
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
    async listServices() { return services.list() },
    async saveService(s: Service) { services.upsert(s) },
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
