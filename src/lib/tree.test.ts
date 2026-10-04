import { describe, expect, it } from 'vitest'
import { childrenOf, computeMove, descendantsOf, duplicationOrder } from './tree'
import type { ObjectRow } from './types'

function page(id: string, parent: string | null, position: number, deleted: string | null = null): ObjectRow {
  return {
    id, type: 'page', parent_id: parent, title: id, icon: null, cover: null, properties: '{}',
    content: null, position, is_favorite: 0, created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: deleted,
  }
}

const tree = [
  page('A', null, 1000), page('B', null, 2000), page('C', null, 3000),
  page('A1', 'A', 1000), page('A2', 'A', 2000), page('A1a', 'A1', 1000),
  page('X', null, 4000, '2026-02-01'),
]

describe('arbre de pages', () => {
  it('liste les enfants dans l\'ordre, sans les pages supprimées', () => {
    expect(childrenOf(tree, null).map((p) => p.id)).toEqual(['A', 'B', 'C'])
    expect(childrenOf(tree, 'A').map((p) => p.id)).toEqual(['A1', 'A2'])
  })

  it('trouve tous les descendants', () => {
    expect(descendantsOf(tree, 'A').map((p) => p.id).sort()).toEqual(['A1', 'A1a', 'A2'])
  })

  it('refuse de déplacer une page dans elle-même ou dans ses descendants', () => {
    expect(computeMove(tree, 'A', 'A', 'into')).toBeNull()
    expect(computeMove(tree, 'A', 'A1a', 'into')).toBeNull()
    expect(computeMove(tree, 'A', 'A1', 'after')).toBeNull()
  })

  it('place une page avant, après ou dedans', () => {
    expect(computeMove(tree, 'C', 'B', 'before')).toEqual({ parent_id: null, position: 1500 })
    expect(computeMove(tree, 'A', 'C', 'after')).toEqual({ parent_id: null, position: 4000 })
    expect(computeMove(tree, 'C', 'A', 'into')).toEqual({ parent_id: 'A', position: 3000 })
    expect(computeMove(tree, 'C', 'A1', 'before')).toEqual({ parent_id: 'A', position: 0 })
  })

  it('ordonne la duplication : la page, puis ses sous-pages non supprimées', () => {
    const withDeleted = [...tree, page('A3', 'A', 3000, '2026-02-01')]
    expect(duplicationOrder(withDeleted, 'A').map((p) => p.id)).toEqual(['A', 'A1', 'A2', 'A1a'])
    expect(duplicationOrder(withDeleted, 'inconnu')).toEqual([])
  })
})
