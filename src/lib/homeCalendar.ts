import { parseSchema, parseValues } from './database'
import { TASK } from './tasks'
import type { Invoice, ObjectRow, Quote } from './types'

export type CalendarKind = 'task' | 'row' | 'invoice' | 'quote'

/** Une ligne du calendrier d'accueil. `open` dit où aller quand on clique dessus. */
export interface CalendarEvent {
  id: string
  date: string
  title: string
  kind: CalendarKind
  open: { to: 'object'; id: string } | { to: 'invoices' } | { to: 'quotes' }
}

export const KIND_LABELS: Record<CalendarKind, string> = { task: 'Tâche', row: 'Base de données', invoice: 'Facture à encaisser', quote: 'Devis' }

/** Date au format AAAA-MM-JJ (les valeurs avec heure sont coupées), ou null. */
const dayOf = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)

/**
 * Tout ce qui a une date : lignes de bases (toute propriété « Date »), tâches non terminées,
 * échéances des factures émises et fin de validité des devis envoyés.
 */
export function collectEvents(objects: ObjectRow[], invoices: Pick<Invoice, 'id' | 'number' | 'status' | 'due_date'>[], quotes: Pick<Quote, 'id' | 'number' | 'status' | 'valid_until'>[]): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const dbs = new Map(objects.filter((o) => o.type === 'database' && !o.deleted_at).map((o) => [o.id, o]))
  for (const row of objects) {
    if (row.type !== 'row' || row.deleted_at || !row.parent_id) continue
    const db = dbs.get(row.parent_id)
    if (!db) continue
    const schema = parseSchema(db.properties)
    if (schema.kind === 'mail') continue
    const values = parseValues(row.properties)
    const isTasks = schema.kind === 'tasks'
    if (isTasks && values[TASK.status] === TASK.done) continue
    for (const col of schema.columns) {
      if (col.type !== 'date') continue
      const date = dayOf(values[col.id])
      if (date) events.push({ id: `${row.id}:${col.id}`, date, title: row.title || 'Nouvelle page', kind: isTasks ? 'task' : 'row', open: { to: 'object', id: row.id } })
    }
  }
  for (const i of invoices) {
    const date = i.status === 'issued' ? dayOf(i.due_date) : null
    if (date) events.push({ id: `inv:${i.id}`, date, title: `Échéance de la facture ${i.number ?? ''}`.trim(), kind: 'invoice', open: { to: 'invoices' } })
  }
  for (const q of quotes) {
    const date = q.status === 'sent' ? dayOf(q.valid_until) : null
    if (date) events.push({ id: `quo:${q.id}`, date, title: `Fin de validité du devis ${q.number ?? ''}`.trim(), kind: 'quote', open: { to: 'quotes' } })
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'fr'))
}

export function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e])
  return map
}
