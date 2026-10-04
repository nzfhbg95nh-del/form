import Database from '@tauri-apps/plugin-sql'
import { buildUpsert, CLIENT_COLUMNS, INVOICE_COLUMNS, INVOICE_LINE_COLUMNS, ISSUE_INVOICE_SQL, ISSUE_QUOTE_SQL, QUOTE_COLUMNS, QUOTE_LINE_COLUMNS, SERVICE_COLUMNS } from './sql'
import type { AuditEntry, Client, Invoice, InvoiceLine, InvoiceStatus, IssueInvoiceInput, IssueQuoteInput, ObjectPatch, ObjectRow, Quote, QuoteLine, QuoteStatus, Repo, Service } from './types'

export async function createSqlRepo(): Promise<Repo> {
  const db = await Database.load('sqlite:form.db')
  const now = () => new Date().toISOString()

  return {
    async listInvoices() {
      return db.select<Invoice[]>('SELECT * FROM invoices ORDER BY created_at DESC')
    },
    async listInvoiceLines() {
      return db.select<InvoiceLine[]>('SELECT * FROM invoice_lines ORDER BY invoice_id, position')
    },
    async saveInvoiceDraft(invoice: Invoice, lines: InvoiceLine[]) {
      const i = invoice as unknown as Record<string, unknown>
      // « WHERE number IS NULL » : une facture déjà numérotée n'est jamais écrasée.
      const result = await db.execute(buildUpsert('invoices', INVOICE_COLUMNS, 'invoices.number IS NULL'), INVOICE_COLUMNS.map((c) => i[c] ?? null))
      if (result.rowsAffected === 0) throw new Error('Cette facture est déjà émise : elle ne peut plus être modifiée.')
      for (const line of lines) {
        const l = line as unknown as Record<string, unknown>
        await db.execute(buildUpsert('invoice_lines', INVOICE_LINE_COLUMNS), INVOICE_LINE_COLUMNS.map((c) => l[c] ?? null))
      }
      if (lines.length === 0) {
        await db.execute('DELETE FROM invoice_lines WHERE invoice_id = $1', [invoice.id])
      } else {
        const marks = lines.map((_, n) => `$${n + 2}`).join(', ')
        await db.execute(`DELETE FROM invoice_lines WHERE invoice_id = $1 AND id NOT IN (${marks})`, [invoice.id, ...lines.map((l) => l.id)])
      }
    },
    async issueInvoice(input: IssueInvoiceInput) {
      await db.execute(ISSUE_INVOICE_SQL, [input.prefix, input.issueDate, input.dueDate, input.snapshot, now(), input.id])
      const rows = await db.select<{ number: string | null }[]>('SELECT number FROM invoices WHERE id = $1', [input.id])
      const number = rows[0]?.number
      if (!number || !number.startsWith(input.prefix)) {
        throw new Error("La facture n'a pas pu être émise : elle est déjà numérotée, ou sa date est antérieure à celle d'une facture déjà émise.")
      }
      return number
    },
    async setInvoiceStatus(id: string, status: Exclude<InvoiceStatus, 'draft'>) {
      await db.execute('UPDATE invoices SET status = $1, updated_at = $2 WHERE id = $3 AND number IS NOT NULL', [status, now(), id])
    },
    async deleteDraftInvoice(id: string) {
      const rows = await db.select<{ number: string | null }[]>('SELECT number FROM invoices WHERE id = $1', [id])
      if (rows[0]?.number) throw new Error('Une facture émise ne peut pas être supprimée : corrige-la par un avoir.')
      await db.execute('DELETE FROM invoice_lines WHERE invoice_id = $1', [id])
      await db.execute('DELETE FROM invoices WHERE id = $1 AND number IS NULL', [id])
    },
    async listAuditLog(entityId?: string) {
      return entityId
        ? db.select<AuditEntry[]>('SELECT * FROM audit_log WHERE entity_id = $1 ORDER BY id', [entityId])
        : db.select<AuditEntry[]>('SELECT * FROM audit_log ORDER BY id DESC LIMIT 500')
    },
    async logAudit(e: { entity: string; entityId: string; number: string | null; action: string; detail: string }) {
      await db.execute('INSERT INTO audit_log (at, entity, entity_id, number, action, detail) VALUES ($1, $2, $3, $4, $5, $6)', [now(), e.entity, e.entityId, e.number, e.action, e.detail])
    },
    async listQuotes() {
      return db.select<Quote[]>('SELECT * FROM quotes ORDER BY created_at DESC')
    },
    async listQuoteLines() {
      return db.select<QuoteLine[]>('SELECT * FROM quote_lines ORDER BY quote_id, position')
    },
    async saveQuoteDraft(quote: Quote, lines: QuoteLine[]) {
      const q = quote as unknown as Record<string, unknown>
      // « WHERE number IS NULL » : un devis déjà numéroté n'est jamais écrasé.
      const result = await db.execute(buildUpsert('quotes', QUOTE_COLUMNS, 'quotes.number IS NULL'), QUOTE_COLUMNS.map((c) => q[c] ?? null))
      if (result.rowsAffected === 0) throw new Error('Ce devis a déjà été envoyé : il ne peut plus être modifié.')
      for (const line of lines) {
        const l = line as unknown as Record<string, unknown>
        await db.execute(buildUpsert('quote_lines', QUOTE_LINE_COLUMNS), QUOTE_LINE_COLUMNS.map((c) => l[c] ?? null))
      }
      if (lines.length === 0) {
        await db.execute('DELETE FROM quote_lines WHERE quote_id = $1', [quote.id])
      } else {
        const marks = lines.map((_, i) => `$${i + 2}`).join(', ')
        await db.execute(`DELETE FROM quote_lines WHERE quote_id = $1 AND id NOT IN (${marks})`, [quote.id, ...lines.map((l) => l.id)])
      }
    },
    async issueQuote(input: IssueQuoteInput) {
      await db.execute(ISSUE_QUOTE_SQL, [input.prefix, input.issueDate, input.validUntil, input.snapshot, now(), input.id])
      const rows = await db.select<{ number: string | null }[]>('SELECT number FROM quotes WHERE id = $1', [input.id])
      const number = rows[0]?.number
      if (!number || !number.startsWith(input.prefix)) throw new Error("Le devis n'a pas pu être envoyé (déjà numéroté ?).")
      return number
    },
    async setQuoteStatus(id: string, status: Exclude<QuoteStatus, 'draft'>) {
      await db.execute('UPDATE quotes SET status = $1, updated_at = $2 WHERE id = $3 AND number IS NOT NULL', [status, now(), id])
    },
    async deleteDraftQuote(id: string) {
      const rows = await db.select<{ number: string | null }[]>('SELECT number FROM quotes WHERE id = $1', [id])
      if (rows[0]?.number) throw new Error('Un devis numéroté ne peut pas être supprimé.')
      await db.execute('DELETE FROM quote_lines WHERE quote_id = $1', [id])
      await db.execute('DELETE FROM quotes WHERE id = $1 AND number IS NULL', [id])
    },
    async listClients() {
      return db.select<Client[]>('SELECT * FROM clients ORDER BY lower(company_name || name)')
    },
    async saveClient(client: Client) {
      const row = client as unknown as Record<string, unknown>
      await db.execute(buildUpsert('clients', CLIENT_COLUMNS), CLIENT_COLUMNS.map((c) => row[c] ?? null))
    },
    async listServices() {
      return db.select<Service[]>('SELECT * FROM services ORDER BY lower(label)')
    },
    async saveService(service: Service) {
      const row = service as unknown as Record<string, unknown>
      await db.execute(buildUpsert('services', SERVICE_COLUMNS), SERVICE_COLUMNS.map((c) => row[c] ?? null))
    },
    async listObjects() {
      return db.select<ObjectRow[]>('SELECT * FROM objects ORDER BY position, created_at')
    },
    async createPage(parentId: string | null = null, type = 'page', properties = '{}') {
      const t = now()
      const row: ObjectRow = {
        id: crypto.randomUUID(), type, parent_id: parentId, title: '', icon: null,
        cover: null, properties, content: null, position: Date.now(), is_favorite: 0,
        created_at: t, updated_at: t, deleted_at: null,
      }
      await db.execute(
        'INSERT INTO objects (id, type, parent_id, title, properties, position, is_favorite, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [row.id, row.type, row.parent_id, row.title, row.properties, row.position, 0, t, t],
      )
      return row
    },
    async updateObject(id: string, patch: ObjectPatch) {
      const keys = Object.keys(patch) as (keyof ObjectPatch)[]
      if (keys.length === 0) return
      const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
      const values = keys.map((k) => patch[k] ?? null)
      await db.execute(
        `UPDATE objects SET ${sets}, updated_at = $${keys.length + 1} WHERE id = $${keys.length + 2}`,
        [...values, now(), id],
      )
    },
    async purgeObject(id: string) {
      await db.execute('DELETE FROM objects WHERE id = $1', [id])
    },
    async getSetting(key: string) {
      const rows = await db.select<{ value: string | null }[]>('SELECT value FROM settings WHERE key = $1', [key])
      return rows[0]?.value ?? null
    },
    async setSetting(key: string, value: string) {
      await db.execute(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value],
      )
    },
    async backupTo(filePath: string) {
      // VACUUM INTO produit une copie propre même si la base est ouverte.
      // SQLite refuse d'écraser un fichier existant, d'où le nom daté côté appelant.
      await db.execute(`VACUUM INTO '${filePath.replace(/'/g, "''")}'`)
    },
  }
}
