// Filtres des listes de factures et de devis : recherche (numéro, objet, client), statut, type, année, client.
// Un filtre vide ne retient rien ; plusieurs choix dans un même filtre = l'un OU l'autre ; des filtres différents = tous à la fois.

import { normalize } from './search'

export interface DocFilters {
  query: string
  statuses: string[]
  kinds: string[]
  years: string[]
  clients: string[]
}

export const NO_DOC_FILTERS: DocFilters = { query: '', statuses: [], kinds: [], years: [], clients: [] }

export const hasDocFilters = (f: DocFilters) => f.query.trim() !== '' || f.statuses.length + f.kinds.length + f.years.length + f.clients.length > 0

/** Ce qu'on sait d'une facture ou d'un devis pour le filtrer. */
export interface DocFacts {
  number: string | null
  title: string
  issueDate: string
  clientId: string | null
  clientName: string
  status: string
  kind?: string
}

/** Le client d'un document sans client : une valeur à part, pour pouvoir le filtrer aussi. */
export const NO_CLIENT = '__none__'

export const yearOf = (iso: string) => iso.slice(0, 4)

export function docMatches(d: DocFacts, f: DocFilters): boolean {
  if (f.statuses.length > 0 && !f.statuses.includes(d.status)) return false
  if (f.kinds.length > 0 && (!d.kind || !f.kinds.includes(d.kind))) return false
  if (f.years.length > 0 && !f.years.includes(yearOf(d.issueDate))) return false
  if (f.clients.length > 0 && !f.clients.includes(d.clientId ?? NO_CLIENT)) return false
  const words = normalize(f.query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = normalize(`${d.number ?? 'brouillon'} ${d.title} ${d.clientName}`)
  return words.every((w) => text.includes(w))
}

/** Les années présentes, de la plus récente à la plus ancienne, avec le nombre de documents. */
export function docYears(docs: DocFacts[]): { id: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const d of docs) {
    const y = yearOf(d.issueDate)
    if (/^\d{4}$/.test(y)) counts.set(y, (counts.get(y) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([id, count]) => ({ id, count }))
}

/** Combien de documents ont telle valeur (statut, type, client). */
export function countBy(docs: DocFacts[], key: (d: DocFacts) => string | undefined): Map<string, number> {
  const counts = new Map<string, number>()
  for (const d of docs) {
    const k = key(d)
    if (k !== undefined) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}
