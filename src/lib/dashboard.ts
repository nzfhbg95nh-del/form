import { invoiceTotalCents } from './invoices'
import { monthlyTotals, type BookRow } from './payments'
import { quoteTotalCents } from './quotes'
import type { Invoice, InvoiceLine, Payment, Quote, QuoteLine } from './types'

/** Chiffre d'affaires encaissé sur une année (c'est ce qui compte pour une micro-entreprise). */
export function collectedForYear(payments: Payment[], year: number): number {
  return payments.filter((p) => p.paid_on.startsWith(`${year}-`)).reduce((s, p) => s + p.amount_cents, 0)
}

export function collectedForMonth(payments: Payment[], year: number, month: number): number {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  return payments.filter((p) => p.paid_on.startsWith(prefix)).reduce((s, p) => s + p.amount_cents, 0)
}

/** Total encaissé par mois d'une année (index 0 = janvier). */
export function collectedByMonth(payments: Payment[], year: number): number[] {
  const rows = payments.filter((p) => p.paid_on.startsWith(`${year}-`)).map((payment) => ({ payment, invoiceNumber: '', clientName: '' }) as BookRow)
  return monthlyTotals(rows)
}

/** Facturé sur une année : factures émises moins avoirs émis, selon la date d'émission. */
export function invoicedForYear(invoices: Invoice[], lines: InvoiceLine[], year: number): number {
  return invoices
    .filter((i) => i.number && i.issue_date.startsWith(`${year}-`))
    .reduce((s, i) => s + invoiceTotalCents(lines.filter((l) => l.invoice_id === i.id)), 0)
}

export type Level = 'ok' | 'near' | 'over'

export interface ThresholdState {
  ratio: number
  level: Level
  remaining: number
}

/** Proche à partir de 80 % du seuil, dépassé au-delà de 100 %. */
export function thresholdState(amount: number, limit: number): ThresholdState {
  const ratio = limit > 0 ? amount / limit : 0
  return { ratio, level: ratio > 1 ? 'over' : ratio >= 0.8 ? 'near' : 'ok', remaining: Math.max(0, limit - amount) }
}

export type VatLevel = 'ok' | 'near' | 'over_base' | 'over_majored'

/** Franchise de TVA : seuil de base et seuil majoré. */
export function vatState(amount: number, base: number, majored: number): { level: VatLevel; base: ThresholdState; majored: ThresholdState } {
  const b = thresholdState(amount, base)
  const m = thresholdState(amount, majored)
  const level: VatLevel = m.level === 'over' ? 'over_majored' : b.level === 'over' ? 'over_base' : b.level === 'near' ? 'near' : 'ok'
  return { level, base: b, majored: m }
}

export interface PendingQuotes {
  drafts: number
  waiting: number
  waitingCents: number
}

/** Devis à suivre : brouillons, et devis envoyés en attente de réponse. */
export function pendingQuotes(quotes: Quote[], lines: QuoteLine[]): PendingQuotes {
  const waiting = quotes.filter((q) => q.status === 'sent')
  return {
    drafts: quotes.filter((q) => q.status === 'draft').length,
    waiting: waiting.length,
    waitingCents: waiting.reduce((s, q) => s + quoteTotalCents(lines.filter((l) => l.quote_id === q.id)), 0),
  }
}

/** Le mois en cours (1 à 12) et l'année, à partir d'une date ISO. */
export function yearMonthOf(todayIso: string): { year: number; month: number } {
  return { year: Number(todayIso.slice(0, 4)), month: Number(todayIso.slice(5, 7)) }
}
