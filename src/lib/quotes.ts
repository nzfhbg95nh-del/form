import { missingForIssuing, vatMention, type Company } from './company'
import type { Client, Quote, QuoteLine, QuoteStatus, Service } from './types'

// ───────────────────────── Argent : tout en centimes, calculs en nombres entiers ─────────────────────────

/** Total d'une ligne en centimes : prix unitaire × quantité, arrondi au centime (demi vers le haut). */
export function lineTotalCents(line: Pick<QuoteLine, 'unit_price_cents' | 'quantity_milli'>): number {
  return Math.floor((line.unit_price_cents * line.quantity_milli + 500) / 1000)
}

export function quoteTotalCents(lines: Pick<QuoteLine, 'unit_price_cents' | 'quantity_milli'>[]): number {
  return lines.reduce((sum, l) => sum + lineTotalCents(l), 0)
}

/** Acompte en centimes, arrondi au centime (demi vers le haut). */
export function depositCents(totalCents: number, percent: number): number {
  return Math.floor((totalCents * percent + 50) / 100)
}

/** « 2,5 » ou « 2.5 » -> 2500 (millièmes). Refuse 0, négatif, plus de 3 décimales. */
export function parseQuantity(text: string): number | null {
  const m = /^(\d+)(?:[.,](\d{1,3}))?$/.exec(text.replace(/\s/g, ''))
  if (!m) return null
  const milli = Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0') || '0')
  return milli > 0 ? milli : null
}

export function formatQuantity(milli: number): string {
  const whole = Math.floor(milli / 1000)
  const frac = String(milli % 1000).padStart(3, '0').replace(/0+$/, '')
  return frac ? `${whole},${frac}` : String(whole)
}

// ───────────────────────── Dates et numéros ─────────────────────────

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function formatDateFr(iso: string): string {
  return iso ? iso.split('-').reverse().join('/') : ''
}

export function numberPrefix(kind: 'D' | 'F' | 'A', issueDate: string): string {
  return `${kind}-${issueDate.slice(0, 4)}-`
}

/** Prochain numéro : le plus grand déjà émis avec ce début, plus 1. Même règle que la requête SQL. */
export function nextNumber(prefix: string, existing: (string | null)[]): string {
  let max = 0
  for (const n of existing) {
    if (n && n.startsWith(prefix)) max = Math.max(max, Number.parseInt(n.slice(prefix.length), 10) || 0)
  }
  return prefix + String(max + 1).padStart(3, '0')
}

// ───────────────────────── Statuts ─────────────────────────

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  refused: 'Refusé',
}

export const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: '#e3e2e0',
  sent: '#d3e5ef',
  accepted: '#dbeddb',
  refused: '#ffe2dd',
}

export const isDraft = (q: Pick<Quote, 'number'>) => q.number === null

// ───────────────────────── Création ─────────────────────────

export function newQuote(company: Company, today: string): Quote {
  const t = new Date().toISOString()
  return {
    id: crypto.randomUUID(), number: null, status: 'draft', client_id: null, title: '',
    issue_date: today, valid_until: addDays(today, company.quoteValidityDays),
    deposit_percent: company.depositPercent, payment_days: company.paymentDays,
    included_revisions: null, notes: '', snapshot: null, created_at: t, updated_at: t,
  }
}

export function newLine(quoteId: string, position: number, service?: Service): QuoteLine {
  return {
    id: crypto.randomUUID(), quote_id: quoteId, position,
    service_id: service?.id ?? null,
    label: service?.label ?? '', description: service?.description ?? '',
    quantity_milli: 1000, unit: service?.unit ?? 'jour', unit_price_cents: service?.unit_price_cents ?? 0,
  }
}

// ───────────────────────── Photo figée à l'envoi ─────────────────────────

export interface QuoteSnapshot {
  company: Omit<Company, 'logo'>
  client: Client
  vatMention: string
}

export function buildSnapshot(company: Company, client: Client, issueDate: string): string {
  const { logo: _logo, ...rest } = company
  void _logo
  const snapshot: QuoteSnapshot = { company: rest, client, vatMention: vatMention(company, issueDate) }
  return JSON.stringify(snapshot)
}

export function parseSnapshot(raw: string | null): QuoteSnapshot | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as QuoteSnapshot
  } catch {
    return null
  }
}

// ───────────────────────── Contrôles avant l'envoi ─────────────────────────

/** Tout ce qui empêche d'envoyer le devis (le brouillon, lui, reste toujours possible). */
export function blockersToSend(quote: Quote, lines: QuoteLine[], client: Client | undefined, company: Company): string[] {
  const problems: string[] = []
  if (!client) problems.push('Choisis un client.')
  if (lines.length === 0) problems.push('Ajoute au moins une ligne.')
  if (lines.some((l) => l.label.trim() === '')) problems.push('Une ligne n\'a pas de libellé.')
  if (lines.some((l) => l.quantity_milli <= 0)) problems.push('Une ligne a une quantité nulle.')
  if (quote.deposit_percent < 0 || quote.deposit_percent > 100) problems.push("L'acompte doit être entre 0 et 100 %.")
  if (quote.valid_until < quote.issue_date) problems.push('La date de validité est avant la date du devis.')
  const missing = missingForIssuing(company)
  if (missing.length > 0) problems.push(`Réglages > Entreprise incomplets : ${missing.join(', ')}.`)
  return problems
}
