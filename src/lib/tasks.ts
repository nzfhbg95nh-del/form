import { newId, type Schema } from './database'

/** Identifiants fixes des propriétés de la base de tâches (les rappels s'appuient dessus). */
export const TASK = {
  status: 'statut',
  due: 'echeance',
  priority: 'priorite',
  done: 'fait',
} as const

export function tasksSchema(): Schema {
  return {
    kind: 'tasks',
    columns: [
      {
        id: TASK.status, name: 'Statut', type: 'select',
        options: [
          { id: 'afaire', label: 'À faire', color: '#fadec9' },
          { id: 'encours', label: 'En cours', color: '#d3e5ef' },
          { id: TASK.done, label: 'Fait', color: '#dbeddb' },
        ],
      },
      { id: TASK.due, name: 'Échéance', type: 'date' },
      {
        id: TASK.priority, name: 'Priorité', type: 'select',
        options: [
          { id: 'haute', label: 'Haute', color: '#ffe2dd' },
          { id: 'moyenne', label: 'Moyenne', color: '#fdecc8' },
          { id: 'basse', label: 'Basse', color: '#e3e2e0' },
        ],
      },
    ],
    views: [
      {
        id: newId(), name: 'À faire', type: 'table',
        filters: [{ id: newId(), colId: TASK.status, op: 'is_not', value: TASK.done }],
        sorts: [{ colId: TASK.due, dir: 'asc' }],
      },
      { id: newId(), name: 'Kanban', type: 'kanban', filters: [], sorts: [{ colId: TASK.due, dir: 'asc' }], groupBy: TASK.status },
      { id: newId(), name: 'Calendrier', type: 'calendar', filters: [], sorts: [], dateCol: TASK.due },
    ],
  }
}
