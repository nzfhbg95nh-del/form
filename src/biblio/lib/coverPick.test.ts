import { describe, expect, it } from 'vitest'
import { pickableBlocks } from './coverPick.ts'
import type { GridBlock } from './blocks.ts'
import { EMPTY_TYPE_INDEX } from './types.ts'

const block = (id: string, extra: Partial<GridBlock> = {}): GridBlock => ({
  id, source: 'instagram', owner: 'muon_office', board: null, originUrl: '', kind: 'image', publishedAt: null, missing: false, rel: `${id}.jpg`,
  firstKind: 'image', thumb: `t/${id}.jpg`, ratio: 1, duration: null, count: 1, search: 'muon_office', ...extra,
})

describe('pickableBlocks', () => {
  it('ne propose que les images qui ont une miniature et un fichier', () => {
    const list = [block('a'), block('sans-miniature', { thumb: null }), block('absent', { missing: true })]
    expect(pickableBlocks(list, '', EMPTY_TYPE_INDEX).map((b) => b.id)).toEqual(['a'])
  })
  it('filtre par ce qu\'on tape (auteur, tableau)', () => {
    const list = [block('a', { owner: 'brigade', search: 'brigade' }), block('b', { owner: 'zed', search: 'zed' })]
    expect(pickableBlocks(list, 'zed', EMPTY_TYPE_INDEX).map((b) => b.id)).toEqual(['b'])
  })
  it('limite le nombre de miniatures', () => {
    const list = Array.from({ length: 10 }, (_, i) => block(`b${i}`))
    expect(pickableBlocks(list, '', EMPTY_TYPE_INDEX, 4)).toHaveLength(4)
  })
})
