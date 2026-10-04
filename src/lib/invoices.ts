import { missingForIssuing, vatMention, type Company } from './company'
import { addDays, depositCents, lineTotalCents, numberPrefix, quoteTotalCents } from './quotes'
import type { Client, Invoice, InvoiceKind, InvoiceLine, Quote, QuoteLine } from './types'

export const KIND_LABELS: Record<InvoiceKind, string> = {
  deposit: "Facture d'acompte",
  final: 'Facture de solde',
  standard: 'Facture',
  credit: 'Avoir',
}

export type DisplayStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'credit' | 'cancelled'

export const DISPLAY_LABELS: Record<DisplayStatus, string> = {
  draft: 'Brouillon', issued: 'Émise', paid: 'Payée', overdue: 'En retard', credit: 'Avoir émis', cancelled: 'Annulée (avoir)',
}
export const DISPLAY_COLORS: Record<DisplayStatus, string> = {
  draft: '#e3e2e0', issued: '#d3e5ef', paid: '#dbeddb', overdue: '#ffe2dd', credit: '#e8deee', cancelled: '#e3e2e0',
}

/** Le statut affiché : « en retard » n'est pas enregistré, il se déduit de la date d'échéance. */
export function displayStatus(inv: Invoice, today: string, fullyCredited = false): DisplayStatus {
  if (inv.status === 'draft') return 'draft'
  if (inv.kind === 'credit') return 'credit'
  if (fullyCredited) return 'cancelled'
  if (inv.status === 'paid') return 'paid'
  return inv.due_date < today ? 'overdue' : 'issued'
}

export const isInvoiceDraft = (i: Pick<Invoice, 'number'>) => i.number === null

export function invoiceTotalCents(lines: Pick<InvoiceLine, 'unit_price_cents' | 'quantity_milli'>[]): number {
  return lines.reduce((sum, l) => sum + lineTotalCents(l), 0)
}

export const invoicePrefix = (kind: InvoiceKind, issueDate: string) => numberPrefix(kind === 'credit' ? 'A' : 'F', issueDate)

const nowISO = () => new Date().toISOString()

function base(company: Company, today: string, kind: InvoiceKind): Invoice {
  const t = nowISO()
  return {
    id: crypto.randomUUID(), number: null, kind, status: 'draft', client_id: null, quote_id: null, related_invoice_id: null,
    title: '', issue_date: today, service_date: today, service_date_end: null,
    due_date: kind === 'credit' ? today : addDays(today, company.paymentDays),
    payment_days: kind === 'credit' ? 0 : company.paymentDays, notes: '', snapshot: null, created_at: t, updated_at: t,
  }
}

function lineOf(invoiceId: string, position: number, p: Partial<InvoiceLine>): InvoiceLine {
  return {
    id: crypto.randomUUID(), invoice_id: invoiceId, position, line_kind: 'item', service_id: null, label: '', description: '',
    quantity_milli: 1000, unit: 'jour', unit_price_cents: 0, ...p,
  }
}

export interface Draft {
  invoice: Invoice
  lines: InvoiceLine[]
}

export function newStandardInvoice(company: Company, today: string): Draft {
  return { invoice: base(company, today, 'standard'), lines: [] }
}

export function newInvoiceLine(invoiceId: string, position: number, p: Partial<InvoiceLine> = {}): InvoiceLine {
  return lineOf(invoiceId, position, p)
}

/** Facture d'acompte : un pourcentage du devis accepté. */
export function depositFromQuote(company: Company, today: string, quote: Quote, quoteLines: QuoteLine[]): Draft {
  const invoice = { ...base(company, today, 'deposit'), client_id: quote.client_id, quote_id: quote.id, title: quote.title }
  const total = quoteTotalCents(quoteLines)
  const amount = depositCents(total, quote.deposit_percent)
  return {
    invoice,
    lines: [lineOf(invoice.id, 0, {
      label: `Acompte de ${quote.deposit_percent}% sur le devis ${quote.number ?? ''}`.trim() + ' (HT)',
      unit: 'forfait', unit_price_cents: amount,
    })],
  }
}

/** Total des acomptes déjà facturés pour un devis : factures d'acompte émises, moins les avoirs qui les annulent. */
export function billedDepositsCents(quoteId: string, invoices: Invoice[], lines: InvoiceLine[]): number {
  const totalOf = (id: string) => invoiceTotalCents(lines.filter((l) => l.invoice_id === id))
  const deposits = invoices.filter((i) => i.quote_id === quoteId && i.kind === 'deposit' && i.number)
  let sum = deposits.reduce((s, d) => s + totalOf(d.id), 0)
  for (const credit of invoices.filter((i) => i.kind === 'credit' && i.number && deposits.some((d) => d.id === i.related_invoice_id))) sum += totalOf(credit.id)
  return sum
}

/** Facture de solde : toutes les lignes du devis, moins les acomptes déjà facturés. */
export function finalFromQuote(company: Company, today: string, quote: Quote, quoteLines: QuoteLine[], invoices: Invoice[], lines: InvoiceLine[]): Draft {
  const invoice = { ...base(company, today, 'final'), client_id: quote.client_id, quote_id: quote.id, title: quote.title }
  const items = quoteLines.map((l, i) => lineOf(invoice.id, i, {
    service_id: l.service_id, label: l.label, description: l.description, quantity_milli: l.quantity_milli, unit: l.unit, unit_price_cents: l.unit_price_cents,
  }))
  const billed = billedDepositsCents(quote.id, invoices, lines)
  if (billed > 0) {
    const numbers = invoices.filter((i) => i.quote_id === quote.id && i.kind === 'deposit' && i.number).map((i) => i.number)
    items.push(lineOf(invoice.id, items.length, {
      line_kind: 'deposit_deduction', label: `Acompte déjà facturé (${numbers.join(', ')})`, unit: 'forfait', unit_price_cents: -billed,
    }))
  }
  return { invoice, lines: items }
}

/** Avoir : reprend les lignes de la facture avec des montants négatifs (modifiable avant émission pour un avoir partiel). */
export function creditFromInvoice(company: Company, today: string, original: Invoice, originalLines: InvoiceLine[]): Draft {
  const invoice = {
    ...base(company, today, 'credit'), client_id: original.client_id, quote_id: original.quote_id, related_invoice_id: original.id,
    title: `Avoir sur la facture ${original.number ?? ''}`.trim(), service_date: original.service_date, service_date_end: original.service_date_end,
  }
  return {
    invoice,
    lines: originalLines.map((l, i) => lineOf(invoice.id, i, {
      line_kind: l.line_kind, service_id: l.service_id, label: l.label, description: l.description,
      quantity_milli: l.quantity_milli, unit: l.unit, unit_price_cents: -l.unit_price_cents,
    })),
  }
}

/** Montant déjà annulé par des avoirs émis sur une facture (en valeur positive). */
export function creditedSoFarCents(invoiceId: string, invoices: Invoice[], lines: InvoiceLine[]): number {
  return invoices
    .filter((i) => i.kind === 'credit' && i.number && i.related_invoice_id === invoiceId)
    .reduce((s, i) => s - invoiceTotalCents(lines.filter((l) => l.invoice_id === i.id)), 0)
}

export interface IssueContext {
  invoices: Invoice[]
  invoiceLines: InvoiceLine[]
}

/** Tout ce qui empêche d'ÉMETTRE la facture (le brouillon, lui, reste toujours possible). */
export function blockersToIssue(invoice: Invoice, lines: InvoiceLine[], client: Client | undefined, company: Company, ctx: IssueContext): string[] {
  const problems: string[] = []
  const total = invoiceTotalCents(lines)
  if (!client) problems.push('Choisis un client.')
  if (lines.length === 0) problems.push('Ajoute au moins une ligne.')
  if (lines.some((l) => l.label.trim() === '')) problems.push("Une ligne n'a pas de libellé.")
  if (lines.some((l) => l.quantity_milli <= 0)) problems.push('Une ligne a une quantité nulle.')
  if (!invoice.service_date) problems.push('Indique la date de la prestation.')
  if (invoice.service_date_end && invoice.service_date_end < invoice.service_date) problems.push('La fin de la prestation est avant son début.')
  if (invoice.due_date < invoice.issue_date) problems.push("La date d'échéance est avant la date de facture.")

  if (invoice.kind === 'credit') {
    if (total >= 0) problems.push('Un avoir doit avoir un total négatif.')
    const original = ctx.invoices.find((i) => i.id === invoice.related_invoice_id)
    if (!original) problems.push("La facture corrigée est introuvable.")
    else {
      const originalTotal = invoiceTotalCents(ctx.invoiceLines.filter((l) => l.invoice_id === original.id))
      if (-total + creditedSoFarCents(original.id, ctx.invoices, ctx.invoiceLines) > originalTotal) problems.push(`Les avoirs dépasseraient le montant de la facture ${original.number}.`)
    }
  } else {
    if (total < 0) problems.push('Le total de la facture ne peut pas être négatif.')
    if (lines.some((l) => l.line_kind === 'item' && l.unit_price_cents < 0)) problems.push("Un prix négatif n'est possible que sur un avoir.")
  }

  if (invoice.kind === 'final' && invoice.quote_id) {
    const pending = ctx.invoices.some((i) => i.quote_id === invoice.quote_id && i.kind === 'deposit' && !i.number)
    if (pending) problems.push("La facture d'acompte de ce devis n'est pas encore émise : émets-la d'abord pour qu'elle soit déduite.")
  }

  // La numérotation suit l'ordre du temps : pas de facture datée avant une facture déjà émise de la même série.
  const prefix = invoicePrefix(invoice.kind, invoice.issue_date)
  const later = ctx.invoices.find((i) => i.id !== invoice.id && i.number?.startsWith(prefix) && i.issue_date > invoice.issue_date)
  if (later) problems.push(`La facture ${later.number} est datée du ${later.issue_date.split('-').reverse().join('/')} : la date de cette facture ne peut pas être plus ancienne.`)

  const missing = missingForIssuing(company)
  if (missing.length > 0) problems.push(`Réglages > Entreprise incomplets : ${missing.join(', ')}.`)
  return problems
}

/** Avertissements qui ne bloquent pas l'émission. */
export function invoiceWarnings(invoice: Invoice, client: Client | undefined, company: Company): string[] {
  const warnings: string[] = []
  if (client && client.country.trim() && client.country.trim().toLowerCase() !== 'france' && !company.foreignClientMentionConfirmed) {
    warnings.push("Client hors de France : la mention spécifique n'est pas encore confirmée par un comptable (Réglages > Entreprise).")
  }
  if (client && client.kind === 'pro' && !client.siren.trim() && !client.siret.trim()) {
    warnings.push("Le SIREN du client manque : il sera obligatoire sur les factures avec la facturation électronique.")
  }
  if (!company.iban.trim() && invoice.kind !== 'credit') warnings.push("Ton IBAN n'est pas renseigné : il n'apparaîtra pas sur la facture.")
  return warnings
}

export interface InvoiceSnapshot {
  company: Omit<Company, 'logo'>
  client: Client
  vatMention: string
  quoteNumber: string | null
  relatedNumber: string | null
}

export function buildInvoiceSnapshot(company: Company, client: Client, issueDate: string, quoteNumber: string | null, relatedNumber: string | null): string {
  const { logo: _logo, ...rest } = company
  void _logo
  const snapshot: InvoiceSnapshot = { company: rest, client, vatMention: vatMention(company, issueDate), quoteNumber, relatedNumber }
  return JSON.stringify(snapshot)
}

export function parseInvoiceSnapshot(raw: string | null): InvoiceSnapshot | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as InvoiceSnapshot
  } catch {
    return null
  }
}
