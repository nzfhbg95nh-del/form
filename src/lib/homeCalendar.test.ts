import { describe, expect, it } from 'vitest'
import { collectEvents, groupByDate, shiftIso, upcomingByDate, weekDays } from './homeCalendar'
import type { ObjectRow } from './types'

const obj = (id: string, extra: Partial<ObjectRow>): ObjectRow => ({
  id, type: 'page', parent_id: null, title: id, icon: null, cover: null, properties: '{}', content: null, position: 0, is_favorite: 0,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', deleted_at: null, ...extra,
})

const schema = (kind: string | undefined) => JSON.stringify({ columns: [{ id: 'd', name: 'Date', type: 'date' }, { id: 't', name: 'Texte', type: 'text' }], views: [{ id: 'v', name: 'T', type: 'table', filters: [], sorts: [] }], ...(kind ? { kind } : {}) })

describe('calendrier de l’accueil', () => {
  const objects = [
    obj('base', { type: 'database', properties: schema(undefined) }),
    obj('taches', { type: 'database', properties: schema('tasks') }),
    obj('courrier', { type: 'database', properties: schema('mail') }),
    obj('r1', { type: 'row', parent_id: 'base', title: 'Rendez-vous', properties: JSON.stringify({ d: '2026-10-12' }) }),
    obj('r2', { type: 'row', parent_id: 'base', title: 'Sans date', properties: '{}' }),
    obj('r3', { type: 'row', parent_id: 'base', title: 'Supprimée', properties: JSON.stringify({ d: '2026-10-12' }), deleted_at: '2026-10-02T00:00:00Z' }),
    obj('t1', { type: 'row', parent_id: 'taches', title: 'Appeler Marie', properties: JSON.stringify({ d: '2026-10-07T09:00' }) }),
    obj('t2', { type: 'row', parent_id: 'taches', title: 'Fini', properties: JSON.stringify({ d: '2026-10-07', statut: 'fait' }) }),
    obj('m1', { type: 'row', parent_id: 'courrier', title: 'Courrier', properties: JSON.stringify({ d: '2026-10-07' }) }),
  ]
  const invoices = [
    { id: 'i1', number: 'F-2026-001', status: 'issued' as const, due_date: '2026-10-30' },
    { id: 'i2', number: 'F-2026-002', status: 'paid' as const, due_date: '2026-10-20' },
    { id: 'i3', number: null, status: 'draft' as const, due_date: '2026-10-21' },
  ]
  const quotes = [
    { id: 'q1', number: 'D-2026-001', status: 'sent' as const, valid_until: '2026-11-03' },
    { id: 'q2', number: 'D-2026-002', status: 'accepted' as const, valid_until: '2026-11-04' },
  ]

  it('réunit lignes de bases, tâches, factures à encaisser et devis envoyés', () => {
    const events = collectEvents(objects, invoices, quotes)
    expect(events.map((e) => [e.date, e.kind, e.title])).toEqual([
      ['2026-10-07', 'task', 'Appeler Marie'],
      ['2026-10-12', 'row', 'Rendez-vous'],
      ['2026-10-30', 'invoice', 'Échéance de la facture F-2026-001'],
      ['2026-11-03', 'quote', 'Fin de validité du devis D-2026-001'],
    ])
  })

  it('regroupe par jour', () => {
    const map = groupByDate(collectEvents(objects, invoices, quotes))
    expect(map.get('2026-10-12')).toHaveLength(1)
    expect(map.get('2026-10-13')).toBeUndefined()
  })

  it('calcule la semaine (du lundi au dimanche) et décale les dates', () => {
    expect(weekDays('2026-10-07')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
    expect(weekDays('2026-10-11')[0]).toBe('2026-10-05')
    expect(weekDays('2026-10-05')[0]).toBe('2026-10-05')
    expect(shiftIso('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftIso('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('liste les prochains jours qui ont quelque chose de prévu', () => {
    const events = collectEvents(objects, invoices, quotes)
    expect(upcomingByDate(events, '2026-10-08').map((g) => g.date)).toEqual(['2026-10-12', '2026-10-30', '2026-11-03'])
    expect(upcomingByDate(events, '2026-10-07', 2).map((g) => g.events.length)).toEqual([1, 1])
    expect(upcomingByDate(events, '2027-01-01')).toEqual([])
  })
})
