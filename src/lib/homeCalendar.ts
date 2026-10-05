import { parseSchema, parseValues } from './database'
import { TASK } from './tasks'
import type { Invoice, ObjectRow, Quote } from './types'

export type CalendarKind = 'event' | 'task' | 'row' | 'invoice' | 'quote'

/** Une ligne du calendrier d'accueil. `open` dit où aller quand on clique dessus. */
export interface CalendarEvent {
  id: string
  date: string
  title: string
  /** Heure de début (HH:MM), pour les événements de l'agenda. */
  time?: string
  kind: CalendarKind
  open: { to: 'object'; id: string } | { to: 'invoices' } | { to: 'quotes' }
}

export const KIND_LABELS: Record<CalendarKind, string> = { event: 'Événement', task: 'Tâche', row: 'Base de données', invoice: 'Facture à encaisser', quote: 'Devis' }

/** Heure valide « HH:MM » (« 9:5 » devient « 09:05 »), sinon undefined. */
export function cleanTime(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(v.trim())
  if (!m) return undefined
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : undefined
}

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
    const isAgenda = schema.kind === 'agenda'
    if (isTasks && values[TASK.status] === TASK.done) continue
    for (const col of schema.columns) {
      if (col.type !== 'date') continue
      const date = dayOf(values[col.id])
      if (date) events.push({ id: `${row.id}:${col.id}`, date, title: row.title || 'Nouvelle page', ...(isAgenda && cleanTime(values.time) ? { time: cleanTime(values.time) } : {}), kind: isTasks ? 'task' : isAgenda ? 'event' : 'row', open: { to: 'object', id: row.id } })
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
  // Par jour, puis les événements sans heure, puis par heure.
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title, 'fr'))
}

export function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e])
  return map
}

/** Ajoute (ou retire, si négatif) des jours à une date AAAA-MM-JJ. */
export function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Les 7 jours (du lundi au dimanche) de la semaine qui contient la date donnée. */
export function weekDays(iso: string): string[] {
  const dow = (new Date(`${iso}T12:00:00`).getDay() + 6) % 7
  const monday = shiftIso(iso, -dow)
  return Array.from({ length: 7 }, (_, i) => shiftIso(monday, i))
}

/** Les prochains événements à partir d'un jour (inclus), regroupés par date, sans jour vide. */
export function upcomingByDate(events: CalendarEvent[], fromIso: string, maxEvents = 12): { date: string; events: CalendarEvent[] }[] {
  const out: { date: string; events: CalendarEvent[] }[] = []
  let count = 0
  for (const e of events) {
    if (e.date < fromIso) continue
    if (count >= maxEvents) break
    const last = out[out.length - 1]
    if (last && last.date === e.date) last.events.push(e)
    else out.push({ date: e.date, events: [e] })
    count++
  }
  return out
}
