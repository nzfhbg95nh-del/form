import { describe, expect, it } from 'vitest'
import { groupPosts, triagePlan, type TriageRow } from './triage.ts'

const row = (blockId: string, rel: string): TriageRow => ({ blockId, source: 'instagram', owner: 'a', board: null, originUrl: null, rel, kind: 'image', thumb: null })

describe('tri rapide des nouveautés', () => {
  const posts = groupPosts([row('p1', 'x/1_01.jpg'), row('p1', 'x/1_02.jpg'), row('p1', 'x/1_03.jpg'), row('p2', 'x/2_01.jpg')])

  it('un carrousel = un post, ses images dans l’ordre', () => {
    expect(posts.map((p) => [p.blockId, p.files.map((f) => f.rel)])).toEqual([['p1', ['x/1_01.jpg', 'x/1_02.jpg', 'x/1_03.jpg']], ['p2', ['x/2_01.jpg']]])
  })
  it('rien d’enlevé : rien ne part', () => {
    expect(triagePlan(posts, new Set())).toEqual({ blocks: [], files: [] })
  })
  it('quelques images d’un carrousel : seules elles partent, le reste reste', () => {
    expect(triagePlan(posts, new Set(['x/1_02.jpg']))).toEqual({ blocks: [], files: ['x/1_02.jpg'] })
  })
  it('toutes les images d’un post : le post part en entier', () => {
    expect(triagePlan(posts, new Set(['x/1_01.jpg', 'x/1_02.jpg', 'x/1_03.jpg', 'x/2_01.jpg']))).toEqual({ blocks: ['p1', 'p2'], files: [] })
  })
})
