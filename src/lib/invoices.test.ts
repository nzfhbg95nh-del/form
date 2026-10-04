import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { newClient, parseSignedEuros } from './business'
import { defaultCompany } from './company'
import {
  billedDepositsCents, blockersToIssue, buildInvoiceSnapshot, creditedSoFarCents, creditFromInvoice, depositFromQuote,
  displayStatus, finalFromQuote, invoicePrefix, invoiceTotalCents, newInvoiceLine, newStandardInvoice, parseInvoiceSnapshot,
} from './invoices'
import { lineTotalCents, newLine, newQuote, nextNumber } from './quotes'
import { buildUpsert, INVOICE_COLUMNS, INVOICE_LINE_COLUMNS, ISSUE_INVOICE_SQL } from './sql'
import type { Invoice, InvoiceLine, Quote, QuoteLine } from './types'

const company = { ...defaultCompany(), siret: '73282932000074' }
const client = { ...newClient(), company_name: 'Acme' }
const TODAY = '2026-10-04'

function acceptedQuote(): { quote: Quote; lines: QuoteLine[] } {
  const quote = { ...newQuote(company, TODAY), number: 'D-2026-001', status: 'accepted' as const, client_id: client.id, title: 'Identité', deposit_percent: 30 }
  const lines = [
    { ...newLine(quote.id, 0), label: 'Logo', unit_price_cents: 45000 },
    { ...newLine(quote.id, 1), label: 'Charte', unit_price_cents: 33333, quantity_milli: 2500 },
  ]
  return { quote, lines }
}

const issued = (inv: Invoice, number: string): Invoice => ({ ...inv, number, status: 'issued' })
const total = (lines: InvoiceLine[]) => invoiceTotalCents(lines)

describe('montants négatifs (avoirs)', () => {
  it('un avoir annule EXACTEMENT la facture, arrondis compris', () => {
    for (const [p, q] of [[333, 500], [10, 50], [1999, 3000], [45000, 2500], [1, 1]] as const) {
      expect(lineTotalCents({ unit_price_cents: -p, quantity_milli: q })).toBe(-lineTotalCents({ unit_price_cents: p, quantity_milli: q }))
    }
  })

  it('lit un montant négatif', () => {
    expect(parseSignedEuros('-12,50')).toBe(-1250)
    expect(parseSignedEuros('12,50')).toBe(1250)
    expect(parseSignedEuros('--1')).toBeNull()
  })
})

describe('facture d\'acompte et de solde', () => {
  it("calcule l'acompte à partir du devis (30 % du total)", () => {
    const { quote, lines } = acceptedQuote()
    const dep = depositFromQuote(company, TODAY, quote, lines)
    const quoteTotal = 45000 + Math.floor((33333 * 2500 + 500) / 1000) // 450 + 833,33
    expect(total(dep.lines)).toBe(Math.floor((quoteTotal * 30 + 50) / 100))
    expect(dep.invoice.kind).toBe('deposit')
    expect(dep.invoice.quote_id).toBe(quote.id)
    expect(dep.lines[0].label).toContain('30%')
  })

  it("le solde = total du devis − acompte facturé : acompte + solde = total du devis, au centime", () => {
    const { quote, lines } = acceptedQuote()
    const dep = depositFromQuote(company, TODAY, quote, lines)
    const depIssued = issued(dep.invoice, 'F-2026-001')
    const fin = finalFromQuote(company, TODAY, quote, lines, [depIssued], dep.lines)
    const quoteTotal = lines.reduce((s, l) => s + lineTotalCents(l), 0)
    expect(total(fin.lines) + total(dep.lines)).toBe(quoteTotal)
    expect(fin.lines.at(-1)?.line_kind).toBe('deposit_deduction')
    expect(fin.lines.at(-1)?.label).toContain('F-2026-001')
  })

  it("ne déduit pas un acompte qui n'est pas encore émis, et refuse de lancer le solde dans ce cas", () => {
    const { quote, lines } = acceptedQuote()
    const dep = depositFromQuote(company, TODAY, quote, lines)
    const fin = finalFromQuote(company, TODAY, quote, lines, [dep.invoice], dep.lines)
    expect(fin.lines.every((l) => l.line_kind === 'item')).toBe(true)
    const problems = blockersToIssue({ ...fin.invoice, client_id: client.id }, fin.lines, client, company, { invoices: [dep.invoice], invoiceLines: dep.lines })
    expect(problems.join(' ')).toContain("pas encore émise")
  })

  it("un acompte annulé par un avoir n'est plus déduit", () => {
    const { quote, lines } = acceptedQuote()
    const dep = depositFromQuote(company, TODAY, quote, lines)
    const depI = issued(dep.invoice, 'F-2026-001')
    const credit = creditFromInvoice(company, TODAY, depI, dep.lines)
    const creditI = issued(credit.invoice, 'A-2026-001')
    expect(billedDepositsCents(quote.id, [depI], dep.lines)).toBe(total(dep.lines))
    expect(billedDepositsCents(quote.id, [depI, creditI], [...dep.lines, ...credit.lines])).toBe(0)
  })
})

describe('avoirs', () => {
  const orig = (() => {
    const inv = { ...newStandardInvoice(company, TODAY).invoice, client_id: client.id }
    const l1 = newInvoiceLine(inv.id, 0, { label: 'Logo', unit_price_cents: 45000 })
    const l2 = newInvoiceLine(inv.id, 1, { label: 'Flyer', unit_price_cents: 333, quantity_milli: 500 })
    return { invoice: issued(inv, 'F-2026-005'), lines: [l1, l2] }
  })()

  it('reprend la facture en négatif et la ramène à zéro', () => {
    const c = creditFromInvoice(company, TODAY, orig.invoice, orig.lines)
    expect(c.invoice.kind).toBe('credit')
    expect(c.invoice.related_invoice_id).toBe(orig.invoice.id)
    expect(total(c.lines) + total(orig.lines)).toBe(0)
  })

  it('refuse un avoir plus grand que la facture, en tenant compte des avoirs déjà émis', () => {
    const c = creditFromInvoice(company, TODAY, orig.invoice, orig.lines)
    const ctx = { invoices: [orig.invoice], invoiceLines: orig.lines }
    expect(blockersToIssue({ ...c.invoice }, c.lines, client, company, ctx)).toEqual([])
    const first = { ...issued(c.invoice, 'A-2026-001') }
    const second = creditFromInvoice(company, TODAY, orig.invoice, orig.lines)
    const problems = blockersToIssue(second.invoice, second.lines, client, company, { invoices: [orig.invoice, first], invoiceLines: [...orig.lines, ...c.lines] })
    expect(problems.join(' ')).toContain('dépasseraient')
    expect(creditedSoFarCents(orig.invoice.id, [orig.invoice, first], [...orig.lines, ...c.lines])).toBe(total(orig.lines))
  })

  it('refuse un avoir positif et un prix négatif sur une facture normale', () => {
    const c = creditFromInvoice(company, TODAY, orig.invoice, orig.lines)
    const positive = c.lines.map((l) => ({ ...l, unit_price_cents: -l.unit_price_cents }))
    expect(blockersToIssue(c.invoice, positive, client, company, { invoices: [orig.invoice], invoiceLines: orig.lines }).join(' ')).toContain('négatif')
    const normal = newStandardInvoice(company, TODAY).invoice
    const bad = [newInvoiceLine(normal.id, 0, { label: 'x', unit_price_cents: -100 })]
    expect(blockersToIssue({ ...normal, client_id: client.id }, bad, client, company, { invoices: [], invoiceLines: [] }).join(' ')).toContain('prix négatif')
  })
})

describe("émission d'une facture", () => {
  it('bloque sans SIRET, client, ligne ; accepte une facture complète', () => {
    const inv = { ...newStandardInvoice(company, TODAY).invoice, client_id: client.id }
    const ok = [newInvoiceLine(inv.id, 0, { label: 'Logo', unit_price_cents: 45000 })]
    const ctx = { invoices: [], invoiceLines: [] }
    expect(blockersToIssue(inv, ok, client, company, ctx)).toEqual([])
    expect(blockersToIssue(inv, ok, client, defaultCompany(), ctx).join(' ')).toContain('SIRET')
    expect(blockersToIssue(inv, [], undefined, company, ctx)).toHaveLength(2)
  })

  it('exige des dates cohérentes et la date de la prestation', () => {
    const inv = { ...newStandardInvoice(company, TODAY).invoice, client_id: client.id }
    const ok = [newInvoiceLine(inv.id, 0, { label: 'Logo', unit_price_cents: 100 })]
    const ctx = { invoices: [], invoiceLines: [] }
    expect(blockersToIssue({ ...inv, due_date: '2026-01-01' }, ok, client, company, ctx).join(' ')).toContain('échéance')
    expect(blockersToIssue({ ...inv, service_end: undefined, service_date_end: '2020-01-01' } as Invoice, ok, client, company, ctx).join(' ')).toContain('fin de la prestation')
    expect(blockersToIssue({ ...inv, service_date: '' }, ok, client, company, ctx).join(' ')).toContain('date de la prestation')
  })

  it("interdit de dater une facture avant une facture déjà émise (numérotation chronologique)", () => {
    const earlier = { ...newStandardInvoice(company, TODAY).invoice, client_id: client.id, issue_date: '2026-10-10' }
    const prior = issued(earlier, 'F-2026-001')
    const inv = { ...newStandardInvoice(company, TODAY).invoice, client_id: client.id, issue_date: '2026-10-04' }
    const ok = [newInvoiceLine(inv.id, 0, { label: 'Logo', unit_price_cents: 100 })]
    expect(blockersToIssue(inv, ok, client, company, { invoices: [prior], invoiceLines: [] }).join(' ')).toContain('F-2026-001')
    // une autre année ou la série des avoirs n'est pas concernée
    expect(blockersToIssue({ ...inv, issue_date: '2027-01-02', due_date: '2027-02-01' }, ok, client, company, { invoices: [prior], invoiceLines: [] })).toEqual([])
  })

  it('choisit la bonne série : F pour les factures, A pour les avoirs', () => {
    expect(invoicePrefix('deposit', '2026-10-04')).toBe('F-2026-')
    expect(invoicePrefix('final', '2026-10-04')).toBe('F-2026-')
    expect(invoicePrefix('standard', '2027-01-01')).toBe('F-2027-')
    expect(invoicePrefix('credit', '2026-10-04')).toBe('A-2026-')
  })

  it('calcule le statut affiché, dont « en retard »', () => {
    const inv = issued({ ...newStandardInvoice(company, TODAY).invoice, due_date: '2026-10-10' }, 'F-2026-001')
    expect(displayStatus(inv, '2026-10-10')).toBe('issued')
    expect(displayStatus(inv, '2026-10-11')).toBe('overdue')
    expect(displayStatus({ ...inv, status: 'paid' }, '2026-12-01')).toBe('paid')
    expect(displayStatus({ ...inv, status: 'draft', number: null }, '2026-12-01')).toBe('draft')
    expect(displayStatus({ ...inv, kind: 'credit' }, '2026-12-01')).toBe('credit')
  })

  it('fige les informations (dont le devis et la facture liés)', () => {
    const snap = parseInvoiceSnapshot(buildInvoiceSnapshot(company, client, '2026-10-04', 'D-2026-001', null))
    expect(snap?.quoteNumber).toBe('D-2026-001')
    expect(snap?.vatMention).toContain('293 B')
    expect(snap?.company).not.toHaveProperty('logo')
  })
})

describe('base SQLite : numérotation, ordre des dates, verrous et journal (migrations exécutées pour de vrai)', () => {
  const dir = join(import.meta.dirname, '../../src-tauri/migrations')
  const freshDb = () => {
    const db = new DatabaseSync(':memory:')
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf-8'))
    return db
  }
  const named = (sql: string) => sql.replace(/\$(\d+)/g, '?$1')
  type V = string | number | null

  const insertInvoice = (db: DatabaseSync, id: string, over: Partial<Invoice> = {}) => {
    const inv = { ...newStandardInvoice(company, TODAY).invoice, id, ...over } as unknown as Record<string, V>
    db.prepare(named(buildUpsert('invoices', INVOICE_COLUMNS))).run(...INVOICE_COLUMNS.map((c) => inv[c] ?? null))
  }
  const insertLine = (db: DatabaseSync, invoiceId: string, id: string) => {
    const l = newInvoiceLine(invoiceId, 0, { id, label: 'Logo', unit_price_cents: 45000 }) as unknown as Record<string, V>
    db.prepare(named(buildUpsert('invoice_lines', INVOICE_LINE_COLUMNS))).run(...INVOICE_LINE_COLUMNS.map((c) => l[c] ?? null))
  }
  const issue = (db: DatabaseSync, id: string, prefix = 'F-2026-', date = '2026-10-04') =>
    db.prepare(named(ISSUE_INVOICE_SQL)).run(prefix, date, '2026-11-03', '{}', 'now', id)
  const numberOf = (db: DatabaseSync, id: string) => (db.prepare('SELECT number FROM invoices WHERE id = ?').get(id) as { number: string | null }).number
  const audit = (db: DatabaseSync) => db.prepare('SELECT action, number, detail FROM audit_log ORDER BY id').all() as { action: string; number: string | null; detail: string }[]

  it('numérote F et A séparément, en continu, sans trou ni doublon', () => {
    const db = freshDb()
    for (const id of ['a', 'b', 'c', 'd']) insertInvoice(db, id, { kind: id === 'd' ? 'credit' : 'standard' })
    issue(db, 'a')
    issue(db, 'b')
    issue(db, 'c')
    issue(db, 'd', 'A-2026-')
    expect(['a', 'b', 'c', 'd'].map((id) => numberOf(db, id))).toEqual(['F-2026-001', 'F-2026-002', 'F-2026-003', 'A-2026-001'])
    const all = (db.prepare('SELECT number FROM invoices').all() as { number: string | null }[]).map((r) => r.number)
    insertInvoice(db, 'e')
    issue(db, 'e')
    expect(numberOf(db, 'e')).toBe(nextNumber('F-2026-', all))
  })

  it('refuse une date antérieure à une facture déjà émise de la même série', () => {
    const db = freshDb()
    insertInvoice(db, 'a')
    insertInvoice(db, 'b')
    issue(db, 'a', 'F-2026-', '2026-10-10')
    const refused = issue(db, 'b', 'F-2026-', '2026-10-04')
    expect(Number(refused.changes)).toBe(0)
    expect(numberOf(db, 'b')).toBeNull()
    expect(Number(issue(db, 'b', 'F-2026-', '2026-10-10').changes)).toBe(1)
    expect(numberOf(db, 'b')).toBe('F-2026-002')
  })

  it('verrouille une facture émise : contenu, lignes, suppression, numéro', () => {
    const db = freshDb()
    insertInvoice(db, 'a')
    insertLine(db, 'a', 'l1')
    issue(db, 'a')
    expect(() => db.prepare("UPDATE invoices SET title = 'autre' WHERE id = 'a'").run()).toThrow(/ne peut plus être modifiée/)
    expect(() => db.prepare("UPDATE invoices SET number = 'F-2026-099' WHERE id = 'a'").run()).toThrow()
    expect(() => db.prepare("UPDATE invoices SET due_date = '2030-01-01' WHERE id = 'a'").run()).toThrow()
    expect(() => insertLine(db, 'a', 'l2')).toThrow()
    expect(() => db.prepare("UPDATE invoice_lines SET unit_price_cents = 1").run()).toThrow()
    expect(() => db.prepare("DELETE FROM invoice_lines WHERE id = 'l1'").run()).toThrow()
    expect(() => db.prepare("DELETE FROM invoices WHERE id = 'a'").run()).toThrow(/avoir/)
  })

  it('inscrit au journal l\'émission et chaque changement de statut, et le journal est intouchable', () => {
    const db = freshDb()
    insertInvoice(db, 'a')
    issue(db, 'a')
    db.prepare("UPDATE invoices SET status = 'paid', updated_at = 'later' WHERE id = 'a'").run()
    expect(audit(db)).toEqual([
      { action: 'issued', number: 'F-2026-001', detail: 'Facture émise le 2026-10-04' },
      { action: 'status', number: 'F-2026-001', detail: 'issued -> paid' },
    ])
    expect(() => db.prepare("UPDATE audit_log SET detail = 'x'").run()).toThrow(/journal/)
    expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow(/journal/)
  })

  it('laisse un brouillon modifiable et supprimable, refuse un type ou statut inconnu', () => {
    const db = freshDb()
    insertInvoice(db, 'a')
    insertLine(db, 'a', 'l1')
    db.prepare("UPDATE invoices SET title = 'ok' WHERE id = 'a'").run()
    db.prepare("DELETE FROM invoice_lines WHERE invoice_id = 'a'").run()
    db.prepare("DELETE FROM invoices WHERE id = 'a'").run()
    expect(() => insertInvoice(db, 'b', { kind: 'zzz' as never })).toThrow()
    insertInvoice(db, 'c')
    expect(() => db.prepare("UPDATE invoices SET status = 'zzz' WHERE id = 'c'").run()).toThrow()
  })

  it("n'attribue jamais un deuxième numéro à une facture déjà numérotée", () => {
    const db = freshDb()
    insertInvoice(db, 'a')
    issue(db, 'a')
    expect(Number(issue(db, 'a').changes)).toBe(0)
    expect(numberOf(db, 'a')).toBe('F-2026-001')
  })
})
