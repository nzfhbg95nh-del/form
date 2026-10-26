import { describe, expect, it } from 'vitest'
import { coverAssetOf, imagesLabel, listBoards, withCoverAsset } from './moodboardList.ts'
import { serializeBoard, emptyBoard, makeImage } from '@/lib/moodboard'
import type { ObjectRow } from '@/lib/types'

const row = (id: string, extra: Partial<ObjectRow> = {}): ObjectRow => ({
  id, type: 'moodboard', parent_id: null, title: id, icon: null, cover: null, properties: '{}', content: null, position: 0, is_favorite: 0,
  created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z', deleted_at: null, ...extra,
})
const withImages = (n: number) => serializeBoard({ ...emptyBoard(), items: Array.from({ length: n }, (_, i) => makeImage(`a${i}`, 100, 80, { x: i * 10, y: 0 })) })

describe('listBoards', () => {
  it('ne garde que les moodboards qui ne sont pas à la corbeille', () => {
    const out = listBoards([row('a'), row('b', { deleted_at: '2026-10-02T00:00:00.000Z' }), row('p', { type: 'page' })])
    expect(out.map((b) => b.id)).toEqual(['a'])
  })
  it('compte les images et trie du plus récent au plus ancien', () => {
    const out = listBoards([
      row('vieux', { updated_at: '2026-10-01T00:00:00.000Z', content: withImages(2) }),
      row('recent', { updated_at: '2026-10-05T00:00:00.000Z', content: withImages(3) }),
    ])
    expect(out.map((b) => [b.id, b.images])).toEqual([['recent', 3], ['vieux', 2]])
  })
  it('un moodboard posé dans une page donne le titre de la page', () => {
    const out = listBoards([row('page1', { type: 'page', title: 'Projet X' }), row('m', { parent_id: 'page1' })])
    expect(out.find((b) => b.id === 'm')?.parentName).toBe('Projet X')
  })
  it('un moodboard sans titre s\'appelle « Moodboard »', () => {
    expect(listBoards([row('a', { title: '  ' })])[0].name).toBe('Moodboard')
  })
  it('un parent à la corbeille n\'est pas montré', () => {
    const out = listBoards([row('p', { type: 'page', title: 'X', deleted_at: '2026-10-02T00:00:00.000Z' }), row('m', { parent_id: 'p' })])
    expect(out[0].parentName).toBeNull()
  })
})

describe('imagesLabel', () => {
  it('dit vide, une image, plusieurs images', () => {
    expect([imagesLabel(0), imagesLabel(1), imagesLabel(4)]).toEqual(['Vide', '1 image', '4 images'])
  })
})

describe('image de couverture', () => {
  it('se retient dans les propriétés sans abîmer le reste', () => {
    const p = withCoverAsset('{"autre":1}', 'img42')
    expect(JSON.parse(p)).toEqual({ autre: 1, coverAsset: 'img42' })
    expect(coverAssetOf(p)).toBe('img42')
  })
  it('se retire, et des propriétés vides ou illisibles ne cassent rien', () => {
    expect(withCoverAsset(withCoverAsset('{}', 'a'), null)).toBe('{}')
    expect(coverAssetOf('{}')).toBeNull()
    expect(coverAssetOf('pas du json')).toBeNull()
    expect(coverAssetOf(null)).toBeNull()
    expect(JSON.parse(withCoverAsset('pas du json', 'z'))).toEqual({ coverAsset: 'z' })
  })
  it('la liste des moodboards donne l\'image de couverture de chacun', () => {
    const b = listBoards([row('a', { properties: '{"coverAsset":"x1"}' }), row('b')])
    expect(b.find((i) => i.id === 'a')?.coverAsset).toBe('x1')
    expect(b.find((i) => i.id === 'b')?.coverAsset).toBeNull()
  })
})
