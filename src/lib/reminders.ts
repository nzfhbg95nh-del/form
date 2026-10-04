import { parseSchema, parseValues } from './database'
import { TASK } from './tasks'
import type { ObjectRow } from './types'

export interface Reminder {
  id: string
  title: string
  due: string
  overdue: boolean
}

export interface SentToday {
  date: string
  ids: string[]
}

/** Tâches à rappeler : échéance aujourd'hui ou dépassée, et pas encore « Fait ». */
export function findDueTasks(objects: ObjectRow[], today: string): Reminder[] {
  const tasksDbs = objects.filter((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'tasks')
  const result: Reminder[] = []
  for (const db of tasksDbs) {
    for (const row of objects) {
      if (row.type !== 'row' || row.parent_id !== db.id || row.deleted_at) continue
      const values = parseValues(row.properties)
      const due = values[TASK.due]
      if (typeof due !== 'string' || due === '' || due > today) continue
      if (values[TASK.status] === TASK.done) continue
      result.push({ id: row.id, title: row.title || 'Sans titre', due, overdue: due < today })
    }
  }
  return result.sort((a, b) => a.due.localeCompare(b.due))
}

/** Écarte les tâches déjà notifiées aujourd'hui. Une tâche n'est rappelée qu'une fois par jour. */
export function pickUnsent(due: Reminder[], sent: SentToday | null, today: string): { fresh: Reminder[]; sent: SentToday } {
  const already = sent && sent.date === today ? sent.ids : []
  const fresh = due.filter((r) => !already.includes(r.id))
  return { fresh, sent: { date: today, ids: [...already, ...fresh.map((r) => r.id)] } }
}

export function reminderText(fresh: Reminder[]): { title: string; body: string } {
  const label = (r: Reminder) => `${r.title}${r.overdue ? ' (en retard)' : ''}`
  const shown = fresh.slice(0, 3).map(label).join(', ')
  const more = fresh.length > 3 ? ` et ${fresh.length - 3} autre${fresh.length - 3 > 1 ? 's' : ''}` : ''
  return {
    title: fresh.length === 1 ? 'Une tâche à faire' : `${fresh.length} tâches à faire`,
    body: shown + more,
  }
}
