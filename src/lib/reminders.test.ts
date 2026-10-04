import { describe, expect, it } from 'vitest'
import { findDueTasks, pickUnsent, reminderText } from './reminders'
import { tasksSchema } from './tasks'
import type { ObjectRow } from './types'

const obj = (id: string, type: string, parent: string | null, title: string, props: unknown, deleted: string | null = null): ObjectRow => ({
  id, type, parent_id: parent, title, icon: null, cover: null, properties: JSON.stringify(props), content: null,
  position: 0, is_favorite: 0, created_at: '', updated_at: '', deleted_at: deleted,
})

const objects = [
  obj('db', 'database', null, 'Tâches', tasksSchema()),
  obj('other', 'database', null, 'Projets', { columns: [], views: [{ id: 'v', name: 'T', type: 'table', filters: [], sorts: [] }] }),
  obj('t1', 'row', 'db', "Aujourd'hui", { echeance: '2026-10-04', statut: 'afaire' }),
  obj('t2', 'row', 'db', 'En retard', { echeance: '2026-10-01', statut: 'encours' }),
  obj('t3', 'row', 'db', 'Demain', { echeance: '2026-10-05' }),
  obj('t4', 'row', 'db', 'Fini', { echeance: '2026-10-01', statut: 'fait' }),
  obj('t5', 'row', 'db', 'Sans date', { statut: 'afaire' }),
  obj('t6', 'row', 'db', 'Supprimée', { echeance: '2026-10-01' }, '2026-10-02'),
  obj('p1', 'row', 'other', 'Autre base', { echeance: '2026-10-01' }),
]

describe('rappels de tâches', () => {
  it('trouve les tâches du jour et en retard, pas les autres', () => {
    const due = findDueTasks(objects, '2026-10-04')
    expect(due.map((r) => r.id)).toEqual(['t2', 't1'])
    expect(due[0].overdue).toBe(true)
    expect(due[1].overdue).toBe(false)
  })

  it("ne rappelle une tâche qu'une fois par jour", () => {
    const due = findDueTasks(objects, '2026-10-04')
    const first = pickUnsent(due, null, '2026-10-04')
    expect(first.fresh).toHaveLength(2)
    const second = pickUnsent(due, first.sent, '2026-10-04')
    expect(second.fresh).toHaveLength(0)
    const nextDay = pickUnsent(findDueTasks(objects, '2026-10-05'), first.sent, '2026-10-05')
    expect(nextDay.fresh.map((r) => r.id)).toEqual(['t2', 't1', 't3'])
  })

  it('écrit un texte clair', () => {
    const due = findDueTasks(objects, '2026-10-04')
    expect(reminderText(due.slice(0, 1)).title).toBe('Une tâche à faire')
    expect(reminderText(due).body).toBe("En retard (en retard), Aujourd'hui")
    expect(reminderText([...due, ...due, ...due]).body).toContain('et 3 autres')
  })
})
