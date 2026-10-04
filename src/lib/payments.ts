import { clientDisplayName, formatEuros } from './business'
import type { Company } from './company'
import { creditedSoFarCents, invoiceTotalCents } from './invoices'
import { addDays, formatDateFr } from './quotes'
import type { Client, Invoice, InvoiceLine, Payment, PaymentMethod } from './types'

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: 'Virement',
  card: 'Carte bancaire',
  cash: 'Espèces',
  cheque: 'Chèque',
  other: 'Autre',
}

export function newPayment(invoiceId: string, paidOn: string, amountCents: number): Payment {
  return { id: crypto.randomUUID(), invoice_id: invoiceId, paid_on: paidOn, amount_cents: amountCents, method: 'transfer', note: '', created_at: new Date().toISOString() }
}

export function paidCents(invoiceId: string, payments: Payment[]): number {
  return payments.filter((p) => p.invoice_id === invoiceId).reduce((s, p) => s + p.amount_cents, 0)
}

/** Montant à encaisser : le total de la facture, moins les avoirs émis qui l'annulent en tout ou partie. */
export function amountDueCents(invoice: Invoice, invoices: Invoice[], lines: InvoiceLine[]): number {
  const total = invoiceTotalCents(lines.filter((l) => l.invoice_id === invoice.id))
  return Math.max(0, total - creditedSoFarCents(invoice.id, invoices, lines))
}

/** Reste à payer (jamais négatif). */
export function remainingCents(invoice: Invoice, invoices: Invoice[], lines: InvoiceLine[], payments: Payment[]): number {
  return Math.max(0, amountDueCents(invoice, invoices, lines) - paidCents(invoice.id, payments))
}

/** La facture doit-elle être « payée » ? Oui quand tout ce qui était dû est encaissé (et qu'il y avait quelque chose à encaisser). */
export function isSettled(invoice: Invoice, invoices: Invoice[], lines: InvoiceLine[], payments: Payment[]): boolean {
  const due = amountDueCents(invoice, invoices, lines)
  return due > 0 && paidCents(invoice.id, payments) >= due
}

/** Annulée en totalité par un ou plusieurs avoirs : plus rien à encaisser. */
export function isFullyCredited(invoice: Invoice, invoices: Invoice[], lines: InvoiceLine[]): boolean {
  return invoice.kind !== 'credit' && !!invoice.number && invoiceTotalCents(lines.filter((l) => l.invoice_id === invoice.id)) > 0 && amountDueCents(invoice, invoices, lines) === 0
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

export interface Receivable {
  invoice: Invoice
  remaining: number
  /** Jours écoulés depuis l'échéance (0 ou négatif : pas encore échue). */
  daysLate: number
}

/** Factures émises qu'il reste à encaisser, les plus en retard d'abord. */
export function receivables(invoices: Invoice[], lines: InvoiceLine[], payments: Payment[], today: string): Receivable[] {
  return invoices
    .filter((i) => i.number && i.kind !== 'credit')
    .map((invoice) => ({ invoice, remaining: remainingCents(invoice, invoices, lines, payments), daysLate: daysBetween(invoice.due_date, today) }))
    .filter((r) => r.remaining > 0)
    .sort((a, b) => b.daysLate - a.daysLate)
}

/** Factures à relancer : échéance dépassée depuis au moins `afterDays` jours. */
export function toChase(rec: Receivable[], afterDays: number): Receivable[] {
  return rec.filter((r) => r.daysLate >= afterDays)
}

// ───────────────────────── Message de relance ─────────────────────────

export const REMINDER_FIELDS = ['{client}', '{numero}', '{montant}', '{echeance}', '{retard}', '{iban}', '{entreprise}']

export function reminderVars(r: Receivable, client: Client | undefined, company: Pick<Company, 'iban' | 'legalName' | 'tradeName'>): Record<string, string> {
  return {
    '{client}': client ? clientDisplayName(client) : '',
    '{numero}': r.invoice.number ?? '',
    '{montant}': formatEuros(r.remaining).replace(/[  ]/g, ' '),
    '{echeance}': formatDateFr(r.invoice.due_date),
    '{retard}': `${r.daysLate} jour${r.daysLate > 1 ? 's' : ''}`,
    '{iban}': company.iban || '(IBAN à compléter)',
    '{entreprise}': company.tradeName || company.legalName,
  }
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((text, [key, value]) => text.split(key).join(value), template)
}

export function mailtoLink(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// ───────────────────────── Livre des recettes ─────────────────────────

export interface BookRow {
  payment: Payment
  invoiceNumber: string
  clientName: string
}

/** Encaissements d'une année, dans l'ordre chronologique. */
export function recipeBook(payments: Payment[], invoices: Invoice[], clients: Client[], year: number): BookRow[] {
  return payments
    .filter((p) => p.paid_on.startsWith(`${year}-`))
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at))
    .map((payment) => {
      const invoice = invoices.find((i) => i.id === payment.invoice_id)
      const client = clients.find((c) => c.id === invoice?.client_id)
      return { payment, invoiceNumber: invoice?.number ?? '', clientName: client ? clientDisplayName(client) : '' }
    })
}

export function bookTotalCents(rows: BookRow[]): number {
  return rows.reduce((s, r) => s + r.payment.amount_cents, 0)
}

/** Total encaissé par mois (index 0 = janvier). */
export function monthlyTotals(rows: BookRow[]): number[] {
  const totals = new Array<number>(12).fill(0)
  for (const r of rows) totals[Number(r.payment.paid_on.slice(5, 7)) - 1] += r.payment.amount_cents
  return totals
}

export function paymentYears(payments: Payment[], today: string): number[] {
  const years = new Set(payments.map((p) => Number(p.paid_on.slice(0, 4))))
  years.add(Number(today.slice(0, 4)))
  return [...years].sort((a, b) => b - a)
}

const csvCell = (value: string) => (/[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/** Montant pour Excel français : « 1234,50 » (virgule décimale, sans espace). */
export const csvAmount = (cents: number) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)},${String(Math.abs(cents) % 100).padStart(2, '0')}`

/** CSV du livre des recettes : séparateur « ; », accents conservés (BOM UTF-8 pour Excel). */
export function recipeBookCsv(rows: BookRow[]): string {
  const header = ['Date', 'Client', 'N° de facture', 'Montant (€)', 'Moyen de paiement', 'Note']
  const lines = rows.map((r) => [formatDateFr(r.payment.paid_on), r.clientName, r.invoiceNumber, csvAmount(r.payment.amount_cents), METHOD_LABELS[r.payment.method], r.payment.note].map(csvCell).join(';'))
  const total = ['Total', '', '', csvAmount(bookTotalCents(rows)), '', ''].join(';')
  return '﻿' + [header.join(';'), ...lines, total].join('\r\n') + '\r\n'
}

export { addDays }
