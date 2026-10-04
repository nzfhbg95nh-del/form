import { describe, expect, it } from 'vitest'
import { applyView, groupRows, monthGrid, parseSchema, type Schema, type ViewConfig } from './database'
import type { ObjectRow } from './types'

const schema: Schema = {
  columns: [
    { id: 'prix', name: 'Prix', type: 'number' },
    { id: 'etat', name: 'État', type: 'select', options: [{ id: 'o1', label: 'À faire', color: '' }, { id: 'o2', label: 'Fini', color: '' }] },
    { id: 'tags', name: 'Tags', type: 'multiselect', options: [{ id: 't1', label: 'Logo', color: '' }] },
    { id: 'date', name: 'Date', type: 'date' },
    { id: 'ok', name: 'Payé', type: 'checkbox' },
  ],
  views: [],
}

function row(id: string, title: string, props: Record<string, unknown>, position = 0): ObjectRow {
  return {
    id, type: 'row', parent_id: 'db', title, icon: null, cover: null, properties: JSON.stringify(props),
    content: null, position, is_favorite: 0, created_at: '', updated_at: '', deleted_at: null,
  }
}

const rows = [
  row('1', 'Éléphant', { prix: 100, etat: 'o1', tags: ['t1'], date: '2026-03-01', ok: true }, 1),
  row('2', 'abricot', { prix: 20, etat: 'o2', date: '2026-01-15' }, 2),
  row('3', 'Zèbre', { etat: 'o1', ok: false }, 3),
]
const view = (v: Partial<ViewConfig>): ViewConfig => ({ id: 'v', name: 'v', type: 'table', filters: [], sorts: [], ...v })
const ids = (r: ObjectRow[]) => r.map((x) => x.id)

describe('filtres et tris des bases de données', () => {
  it('filtre le texte sans tenir compte des accents ni des majuscules', () => {
    const f = view({ filters: [{ id: 'f', colId: 'title', op: 'contains', value: 'elephant' }] })
    expect(ids(applyView(rows, schema, f))).toEqual(['1'])
  })

  it('filtre les nombres, les choix, les dates, les cases et les vides', () => {
    const f = (colId: string, op: never, value = '') => ids(applyView(rows, schema, view({ filters: [{ id: 'f', colId, op, value }] })))
    expect(f('prix', 'gt' as never, '50')).toEqual(['1'])
    expect(f('etat', 'is' as never, 'o1')).toEqual(['1', '3'])
    expect(f('tags', 'contains' as never, 't1')).toEqual(['1'])
    expect(f('date', 'before' as never, '2026-02-01')).toEqual(['2'])
    expect(f('ok', 'checked' as never)).toEqual(['1'])
    expect(f('prix', 'is_empty' as never)).toEqual(['3'])
  })

  it('cumule plusieurs filtres (ET)', () => {
    const f = view({ filters: [
      { id: 'a', colId: 'etat', op: 'is', value: 'o1' },
      { id: 'b', colId: 'prix', op: 'not_empty', value: '' },
    ] })
    expect(ids(applyView(rows, schema, f))).toEqual(['1'])
  })

  it('trie, avec les valeurs vides toujours à la fin', () => {
    expect(ids(applyView(rows, schema, view({ sorts: [{ colId: 'prix', dir: 'asc' }] })))).toEqual(['2', '1', '3'])
    expect(ids(applyView(rows, schema, view({ sorts: [{ colId: 'prix', dir: 'desc' }] })))).toEqual(['1', '2', '3'])
    expect(ids(applyView(rows, schema, view({ sorts: [{ colId: 'title', dir: 'asc' }] })))).toEqual(['2', '1', '3'])
  })

  it('ignore un filtre ou un tri sur une colonne supprimée', () => {
    const f = view({ filters: [{ id: 'x', colId: 'disparue', op: 'contains', value: 'a' }], sorts: [{ colId: 'disparue', dir: 'asc' }] })
    expect(ids(applyView(rows, schema, f))).toEqual(['1', '2', '3'])
  })

  it('repart d\'un schéma par défaut si les données sont illisibles', () => {
    expect(parseSchema('n importe quoi').views).toHaveLength(1)
    expect(parseSchema('{}').columns.length).toBeGreaterThan(0)
  })
})

describe('groupements et calendrier', () => {
  it('groupe par choix unique, avec « Sans valeur » à la fin', () => {
    const g = groupRows(rows, schema.columns[1])
    expect(g.map((x) => [x.label, ids(x.rows)])).toEqual([['À faire', ['1', '3']], ['Fini', ['2']], ['Sans valeur', []]])
  })

  it('groupe par choix multiple (une ligne peut être dans plusieurs groupes)', () => {
    const g = groupRows(rows, schema.columns[2])
    expect(g.map((x) => [x.label, ids(x.rows)])).toEqual([['Logo', ['1']], ['Sans valeur', ['2', '3']]])
  })

  it('groupe par case à cocher', () => {
    const g = groupRows(rows, schema.columns[4])
    expect(g.map((x) => ids(x.rows))).toEqual([['1'], ['2', '3']])
  })

  it('construit la grille du mois du lundi au dimanche', () => {
    const weeks = monthGrid(2026, 9) // octobre 2026 : le 1er est un jeudi
    expect(weeks[0][0]).toEqual({ date: '2026-09-28', inMonth: false })
    expect(weeks[0][3]).toEqual({ date: '2026-10-01', inMonth: true })
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(31)
  })
})
