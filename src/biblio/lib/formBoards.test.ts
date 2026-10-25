import { describe, expect, it } from 'vitest'
import type { BlockFileInfo } from './blocks.ts'
import { addedMessage, assetName, assetPrefix, MAX_SLIDES, placeNewItems, slidesOf } from './formBoardsPure.ts'
import type { BoardItem } from '@/lib/moodboard'

const file = (rel: string, kind: BlockFileInfo['kind'] = 'image', extra: Partial<BlockFileInfo> = {}): BlockFileInfo => ({ rel, kind, width: 100, height: 100, duration: null, thumb: `t/${rel}`, missing: false, ...extra })
const item = (id: string, x: number, y: number, w = 100, h = 80): BoardItem => ({ id, kind: 'image', assetId: id, x, y, w, h })

describe('slidesOf', () => {
  it('garde les images et les vidéos dans l\'ordre', () => {
    expect(slidesOf([file('a.jpg'), file('c.mp4', 'video')]).map((f) => f.rel)).toEqual(['a.jpg', 'c.mp4'])
  })
  it('un fichier absent du disque reste utilisable s\'il a une miniature', () => {
    expect(slidesOf([file('a.jpg', 'image', { missing: true }), file('b.jpg', 'image', { missing: true, thumb: null })]).map((f) => f.rel)).toEqual(['a.jpg'])
  })
  it('dix images au plus', () => {
    const many = Array.from({ length: 15 }, (_, i) => file(`${i}.jpg`))
    expect(slidesOf(many)).toHaveLength(MAX_SLIDES)
  })
})

describe('placeNewItems', () => {
  it('place les nouvelles images à droite de la toile, sans toucher aux anciennes', () => {
    const old = [item('o1', 0, 0), item('o2', 120, 40)]
    const out = placeNewItems(old, [item('n1', 0, 0), item('n2', 0, 0)])
    expect(out.slice(0, 2)).toEqual(old)
    const right = Math.max(...old.map((i) => i.x + i.w))
    for (const n of out.slice(2)) expect(n.x).toBeGreaterThanOrEqual(right + 80 - 0.001)
  })
  it('ne superpose pas les nouvelles images entre elles', () => {
    const out = placeNewItems([item('o', 0, 0)], [item('a', 0, 0), item('b', 0, 0), item('c', 0, 0)]).slice(1)
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j]
      const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
      expect(overlap).toBe(false)
    }
  })
  it('sur une toile vide, les images sont centrées autour de l\'origine', () => {
    const out = placeNewItems([], [item('a', 0, 0, 200, 100)])
    expect(out[0].x + out[0].w / 2).toBeCloseTo(0, 5)
    expect(out[0].y + out[0].h / 2).toBeCloseTo(0, 5)
  })
  it('rien à ajouter : la toile ne change pas', () => {
    const old = [item('o', 5, 5)]
    expect(placeNewItems(old, [])).toEqual(old)
  })
})

describe('étiquette et message', () => {
  it('le nom de la copie commence par l\'étiquette du bloc', () => {
    expect(assetName('ig:a_b:20260101', 'x.jpg').startsWith(assetPrefix('ig:a_b:20260101'))).toBe(true)
    expect(assetName('ig:ab:1', 'x.jpg').startsWith(assetPrefix('ig:a_b:1'))).toBe(false)
  })
  it('message de confirmation', () => {
    expect(addedMessage(3, 0, 'Ma toile')).toBe('3 images ajoutées à « Ma toile ».')
    expect(addedMessage(1, 1, 'T')).toBe('1 image ajoutée à « T » (1 illisible).')
    expect(addedMessage(0, 2, 'T')).toBe('Impossible de lire ces images.')
  })
})
