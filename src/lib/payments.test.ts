import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { newClient } from './business'
import { defaultCompany } from './company'
import { creditFromInvoice, newInvoiceLine, newStandardInvoice } from './invoices'
import {
  amountDueCents, bookTotalCents, csvAmount, daysBetween, fillTemplate, isFullyCredited, isSettled, mailtoLink, monthlyTotals,
  newPayment, paidCents, paymentYears, receivables, recipeBook, recipeBookCsv, remainingCents, reminderVars, toChase,
} from './payments'
import { buildUpsert, INVOICE_COLUMNS, ISSUE_INVOICE_SQL, PAYMENT_COLUMNS } from './sql'
import type { Invoice, InvoiceLine } from './types'

const company = { ...defaultCompany(), siret: '73282932000074', iban: 'FR76 1234' }
const client = { ...newClient(), id: 'c1', company_name: 'Acme; "Studio"' }
const TODAY = '2026-10-20'

function issuedInvoice(id: string, number: string, due: string, unitCents: number): { invoice: Invoice; lines: InvoiceLine[] } {
  const inv = { ...newStandardInvoice(company, '2026-09-01').invoice, id, number, status: 'issued' as const, client_id: 'c1', due_date: due }
  return { invoice: inv, lines: [newInvoiceLine(id, 0, { label: 'Logo', unit_price_cents: unitCents })] }
}

describe('reste à payer', () => {
  const a = issuedInvoice('a', 'F-2026-001', '2026-10-01', 100000)

  it('cumule les paiements partiels', () => {
    const p1 = newPayment('a', '2026-10-02', 30000)
    const p2 = newPayment('a', '2026-10-05', 20000)
    expect(paidCents('a', [p1, p2])).toBe(50000)
    expect(remainingCents(a.invoice, [a.invoice], a.lines, [p1, p2])).toBe(50000)
    expect(isSettled(a.invoice, [a.invoice], a.lines, [p1, p2])).toBe(false)
    expect(isSettled(a.invoice, [a.invoice], a.lines, [p1, p2, newPayment('a', '2026-10-06', 50000)])).toBe(true)
  })

  it('un avoir réduit ce qui est dû ; un avoir total annule la facture', () => {
    const partial = creditFromInvoice(company, TODAY, a.invoice, a.lines)
    const half = { ...partial, lines: partial.lines.map((l) => ({ ...l, unit_price_cents: -40000 })) }
    const credit = { ...half.invoice, number: 'A-2026-001', status: 'issued' as const }
    expect(amountDueCents(a.invoice, [a.invoice, credit], [...a.lines, ...half.lines])).toBe(60000)
    expect(isFullyCredited(a.invoice, [a.invoice, credit], [...a.lines, ...half.lines])).toBe(false)
    const full = creditFromInvoice(company, TODAY, a.invoice, a.lines)
    const fullCredit = { ...full.invoice, number: 'A-2026-002', status: 'issued' as const }
    expect(amountDueCents(a.invoice, [a.invoice, fullCredit], [...a.lines, ...full.lines])).toBe(0)
    expect(isFullyCredited(a.invoice, [a.invoice, fullCredit], [...a.lines, ...full.lines])).toBe(true)
    expect(isSettled(a.invoice, [a.invoice, fullCredit], [...a.lines, ...full.lines], [])).toBe(false)
  })
})

describe('factures à encaisser et à relancer', () => {
  const late = issuedInvoice('late', 'F-2026-001', '2026-10-01', 50000) // 19 jours de retard
  const recent = issuedInvoice('recent', 'F-2026-002', '2026-10-17', 20000) // 3 jours
  const future = issuedInvoice('future', 'F-2026-003', '2026-11-30', 10000)
  const paid = issuedInvoice('paid', 'F-2026-004', '2026-10-01', 10000)
  const draft = { invoice: { ...issuedInvoice('draft', 'x', '2026-10-01', 1).invoice, number: null, status: 'draft' as const }, lines: [] as InvoiceLine[] }
  const all = [late, recent, future, paid, draft]
  const invoices = all.map((x) => x.invoice)
  const lines = all.flatMap((x) => x.lines)
  const payments = [newPayment('paid', '2026-10-02', 10000)]

  it('liste ce qui reste à encaisser, le plus en retard d\'abord, sans brouillons ni factures soldées', () => {
    const rec = receivables(invoices, lines, payments, TODAY)
    expect(rec.map((r) => r.invoice.id)).toEqual(['late', 'recent', 'future'])
    expect(rec[0].daysLate).toBe(19)
    expect(rec[2].daysLate).toBeLessThan(0)
  })

  it("propose la relance à l'échéance + 7 jours", () => {
    const rec = receivables(invoices, lines, payments, TODAY)
    expect(toChase(rec, 7).map((r) => r.invoice.id)).toEqual(['late'])
    expect(toChase(rec, 3).map((r) => r.invoice.id)).toEqual(['late', 'recent'])
  })

  it('compte les jours entre deux dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-20')).toBe(19)
    expect(daysBetween('2026-12-25', '2027-01-05')).toBe(11)
  })

  it('remplit le message de relance et prépare le lien mail', () => {
    const rec = receivables(invoices, lines, payments, TODAY)[0]
    const vars = reminderVars(rec, client, company)
    const body = fillTemplate('Facture {numero} de {montant}, échue le {echeance} ({retard}). IBAN {iban}', vars)
    expect(body).toBe('Facture F-2026-001 de 500,00 €, échue le 01/10/2026 (19 jours). IBAN FR76 1234')
    expect(fillTemplate('{numero} {numero}', vars)).toBe('F-2026-001 F-2026-001')
    const link = mailtoLink(' a@b.fr ', 'Rappel F-1', 'Ligne 1\nLigne 2 & "x"')
    expect(link).toBe('mailto:a%40b.fr?subject=Rappel%20F-1&body=Ligne%201%0ALigne%202%20%26%20%22x%22')
  })
})

describe('livre des recettes', () => {
  const a = issuedInvoice('a', 'F-2026-001', '2026-10-01', 100000)
  const b = issuedInvoice('b', 'F-2026-002', '2026-10-01', 50000)
  const invoices = [a.invoice, b.invoice]
  const mk = (invoiceId: string, date: string, cents: number, extra = {}) => ({ ...newPayment(invoiceId, date, cents), ...extra })
  const payments = [
    mk('b', '2026-03-10', 25000, { created_at: '2026-03-10T10:00:00Z' }),
    mk('a', '2026-01-15', 99999, { created_at: '2026-01-15T10:00:00Z', note: 'acompte; "partiel"' }),
    mk('a', '2026-01-15', 1, { created_at: '2026-01-15T11:00:00Z' }),
    mk('a', '2025-12-31', 5000),
  ]

  it("classe les encaissements d'une année dans l'ordre chronologique", () => {
    const rows = recipeBook(payments, invoices, [client], 2026)
    expect(rows.map((r) => [r.payment.paid_on, r.payment.amount_cents])).toEqual([['2026-01-15', 99999], ['2026-01-15', 1], ['2026-03-10', 25000]])
    expect(rows[0].invoiceNumber).toBe('F-2026-001')
    expect(bookTotalCents(rows)).toBe(125000)
    expect(recipeBook(payments, invoices, [client], 2025)).toHaveLength(1)
  })

  it('totalise par mois et propose les années', () => {
    const rows = recipeBook(payments, invoices, [client], 2026)
    expect(monthlyTotals(rows)).toEqual([100000, 0, 25000, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(paymentYears(payments, '2026-10-20')).toEqual([2026, 2025])
    expect(paymentYears([], '2027-02-01')).toEqual([2027])
  })

  it('exporte un CSV lisible par Excel (virgule décimale, ; , guillemets protégés)', () => {
    const csv = recipeBookCsv(recipeBook(payments, invoices, [client], 2026))
    const lines = csv.replace('﻿', '').split('\r\n')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(lines[0]).toBe('Date;Client;N° de facture;Montant (€);Moyen de paiement;Note')
    expect(lines[1]).toBe('15/01/2026;"Acme; ""Studio""";F-2026-001;999,99;Virement;"acompte; ""partiel"""')
    expect(lines.at(-2)).toBe('Total;;;1250,00;;')
    expect(csvAmount(5)).toBe('0,05')
    expect(csvAmount(123450)).toBe('1234,50')
  })
})

describe('base SQLite : paiements (migrations exécutées pour de vrai)', () => {
  const dir = join(import.meta.dirname, '../../src-tauri/migrations')
  const freshDb = () => {
    const db = new DatabaseSync(':memory:')
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf-8'))
    return db
  }
  const named = (sql: string) => sql.replace(/\$(\d+)/g, '?$1')
  type V = string | number | null
  const insertInvoice = (db: DatabaseSync, id: string, over: Partial<Invoice> = {}) => {
    const inv = { ...newStandardInvoice(company, '2026-10-01').invoice, id, ...over } as unknown as Record<string, V>
    db.prepare(named(buildUpsert('invoices', INVOICE_COLUMNS))).run(...INVOICE_COLUMNS.map((c) => inv[c] ?? null))
  }
  const issue = (db: DatabaseSync, id: string) => db.prepare(named(ISSUE_INVOICE_SQL)).run('F-2026-', '2026-10-01', '2026-10-31', '{}', 'now', id)
  const addPayment = (db: DatabaseSync, invoiceId: string, cents = 10000, id: string = crypto.randomUUID()) => {
    const p = { ...newPayment(invoiceId, '2026-10-05', cents), id } as unknown as Record<string, V>
    db.prepare(named(buildUpsert('payments', PAYMENT_COLUMNS).replace(/ ON CONFLICT.*$/, ''))).run(...PAYMENT_COLUMNS.map((c) => p[c] ?? null))
  }
  const audit = (db: DatabaseSync) => (db.prepare('SELECT action, detail FROM audit_log ORDER BY id').all() as { action: string; detail: string }[])

  it("refuse un paiement sur un brouillon ou sur un avoir, accepte sur une facture émise", () => {
    const db = freshDb()
    insertInvoice(db, 'draft')
    expect(() => addPayment(db, 'draft')).toThrow(/facture émise/)
    insertInvoice(db, 'credit', { kind: 'credit' })
    issue(db, 'credit')
    expect(() => addPayment(db, 'credit')).toThrow()
    insertInvoice(db, 'a')
    issue(db, 'a')
    addPayment(db, 'a')
    expect(db.prepare('SELECT count(*) AS n FROM payments').get()).toEqual({ n: 1 })
  })

  it('refuse un montant nul ou négatif et une modification', () => {
    const db = freshDb()
    insertInvoice(db, 'a')
    issue(db, 'a')
    expect(() => addPayment(db, 'a', 0)).toThrow()
    expect(() => addPayment(db, 'a', -5)).toThrow()
    addPayment(db, 'a', 5000, 'p1')
    expect(() => db.prepare("UPDATE payments SET amount_cents = 1 WHERE id = 'p1'").run()).toThrow(/ne se modifie pas/)
  })

  it('inscrit au journal chaque paiement, chaque suppression, et le passage à « payée »', () => {
    const db = freshDb()
    insertInvoice(db, 'a')
    issue(db, 'a')
    addPayment(db, 'a', 12345, 'p1')
    db.prepare("UPDATE invoices SET status = 'paid', updated_at = 'x' WHERE id = 'a'").run()
    db.prepare("DELETE FROM payments WHERE id = 'p1'").run()
    expect(audit(db).map((e) => e.action)).toEqual(['issued', 'payment', 'status', 'payment_deleted'])
    expect(audit(db)[1].detail).toBe('Paiement de 123.45 EUR reçu le 2026-10-05 (transfer)')
    expect(audit(db)[3].detail).toContain('123.45 EUR du 2026-10-05')
    expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow()
  })
})
