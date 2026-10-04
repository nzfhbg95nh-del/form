import { describe, expect, it } from 'vitest'
import { toggleHalf, reorderWidget, addWidget, DEFAULT_WIDGETS, databaseRows, favoritePages, greeting, moveWidget, parseWidgets, recentPages, removeWidget } from './home'
import type { ObjectRow } from './types'

const obj = (id: string, extra: Partial<ObjectRow> = {}): ObjectRow => ({
  id, type: 'page', parent_id: null, title: id, icon: null, cover: null, properties: '{}', content: null, position: 0, is_favorite: 0,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', deleted_at: null, ...extra,
})

describe('widgets de la page d’accueil', () => {
  it('prend la disposition par défaut sans réglage ou si le réglage est abîmé', () => {
    expect(parseWidgets(null)).toEqual(DEFAULT_WIDGETS)
    expect(parseWidgets('pas du json')).toEqual(DEFAULT_WIDGETS)
    expect(parseWidgets('{"a":1}')).toEqual(DEFAULT_WIDGETS)
  })

  it('ignore les widgets inconnus ou en double', () => {
    const raw = JSON.stringify([{ id: 'a', type: 'tasks' }, { id: 'a', type: 'note' }, { id: 'b', type: 'inconnu' }, { id: 'c', type: 'database', dbId: 'x' }, 42])
    expect(parseWidgets(raw)).toEqual([{ id: 'a', type: 'tasks' }, { id: 'c', type: 'database', dbId: 'x' }])
  })

  it('ajoute, déplace et retire sans casser la liste', () => {
    const added = addWidget(DEFAULT_WIDGETS, 'note')
    expect(added).toHaveLength(5)
    expect(added[4].type).toBe('note')
    expect(new Set(added.map((w) => w.id)).size).toBe(5)
    expect(addWidget(added, 'database', 'db1')[5].dbId).toBe('db1')

    expect(moveWidget(DEFAULT_WIDGETS, 'recents', -1)).toEqual(DEFAULT_WIDGETS)
    expect(moveWidget(DEFAULT_WIDGETS, 'recents', 1).map((w) => w.id)).toEqual(['favorites', 'recents', 'summary', 'tasks'])
    expect(moveWidget(DEFAULT_WIDGETS, 'inconnu', 1)).toEqual(DEFAULT_WIDGETS)
    expect(removeWidget(DEFAULT_WIDGETS, 'summary').map((w) => w.id)).toEqual(['recents', 'favorites', 'tasks'])
  })

  it('déplace un widget avant ou après un autre (glisser-déposer)', () => {
    const ids = (l: ReturnType<typeof reorderWidget>) => l.map((w) => w.id)
    expect(ids(reorderWidget(DEFAULT_WIDGETS, 'tasks', 'recents', 'before'))).toEqual(['tasks', 'recents', 'favorites', 'summary'])
    expect(ids(reorderWidget(DEFAULT_WIDGETS, 'recents', 'summary', 'after'))).toEqual(['favorites', 'summary', 'recents', 'tasks'])
    expect(ids(reorderWidget(DEFAULT_WIDGETS, 'favorites', 'favorites', 'after'))).toEqual(['recents', 'favorites', 'summary', 'tasks'])
    expect(reorderWidget(DEFAULT_WIDGETS, 'inconnu', 'tasks', 'before')).toEqual(DEFAULT_WIDGETS)
    expect(reorderWidget(DEFAULT_WIDGETS, 'tasks', 'inconnu', 'before')).toEqual(DEFAULT_WIDGETS)
  })

  it('met un widget en demi-largeur et le remet en pleine largeur', () => {
    const half = toggleHalf(DEFAULT_WIDGETS, 'favorites')
    expect(half.find((w) => w.id === 'favorites')?.half).toBe(true)
    expect(half.find((w) => w.id === 'recents')?.half).toBeUndefined()
    expect(toggleHalf(half, 'favorites')).toEqual(DEFAULT_WIDGETS)
    expect(parseWidgets(JSON.stringify(half)).find((w) => w.id === 'favorites')?.half).toBe(true)
  })

  it('dit bonjour le jour et bonsoir le soir', () => {
    expect(greeting(9)).toBe('Bonjour')
    expect(greeting(17)).toBe('Bonjour')
    expect(greeting(18)).toBe('Bonsoir')
    expect(greeting(2)).toBe('Bonsoir')
  })

  it('choisit les pages récentes et les favoris, sans corbeille ni lignes de base', () => {
    const objects = [
      obj('vieille', { updated_at: '2026-09-01T00:00:00Z' }),
      obj('neuve', { updated_at: '2026-10-04T00:00:00Z', is_favorite: 1 }),
      obj('corbeille', { updated_at: '2026-10-05T00:00:00Z', deleted_at: '2026-10-05T01:00:00Z', is_favorite: 1 }),
      obj('ligne', { type: 'row', updated_at: '2026-10-06T00:00:00Z' }),
    ]
    expect(recentPages(objects, 5).map((o) => o.id)).toEqual(['neuve', 'vieille'])
    expect(recentPages(objects, 1).map((o) => o.id)).toEqual(['neuve'])
    expect(favoritePages(objects).map((o) => o.id)).toEqual(['neuve'])
  })

  it('liste les lignes d’une base, les plus récentes d’abord', () => {
    const objects = [
      obj('l1', { type: 'row', parent_id: 'db', updated_at: '2026-10-01T00:00:00Z' }),
      obj('l2', { type: 'row', parent_id: 'db', updated_at: '2026-10-03T00:00:00Z' }),
      obj('l3', { type: 'row', parent_id: 'autre' }),
      obj('l4', { type: 'row', parent_id: 'db', deleted_at: '2026-10-04T00:00:00Z' }),
    ]
    expect(databaseRows(objects, 'db').map((o) => o.id)).toEqual(['l2', 'l1'])
  })
})
