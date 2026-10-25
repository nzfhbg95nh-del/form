import { describe, expect, it } from 'vitest'
import { addImages, emptyBoard, makeNote, serializeBoard } from './moodboard.ts'
import { byRecent, itemCount, previewsOf, type MoodboardCard } from './moodboards.ts'

const card = (id: string, name: string, updatedAt: string): MoodboardCard => ({ id, name, collectionId: null, updatedAt, count: 0, previews: [] })

describe('itemCount', () => {
  it('compte les éléments de la toile, zéro si elle est vide ou illisible', () => {
    expect(itemCount(null)).toBe(0)
    expect(itemCount('')).toBe(0)
    expect(itemCount('pas du json')).toBe(0)
    const board = { ...emptyBoard(), items: [makeNote({ x: 0, y: 0 }, 'a'), makeNote({ x: 10, y: 0 }, 'b')] }
    expect(itemCount(serializeBoard(board))).toBe(2)
  })
})

describe('byRecent', () => {
  it('le plus récemment modifié d\'abord, puis par nom', () => {
    const list = [card('a', 'Bravo', '2026-10-01T10:00:00Z'), card('b', 'Alpha', '2026-10-02T10:00:00Z'), card('c', 'Alpha', '2026-10-01T10:00:00Z')]
    expect([...list].sort(byRecent).map((c) => c.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('previewsOf', () => {
  it('prend les miniatures des 4 premières images, ignore notes et images sans miniature', () => {
    const refs = [1, 2, 3, 4, 5].map((n) => ({ blockId: `b${n}`, rel: `r${n}.jpg`, thumb: n === 2 ? null : `t${n}.jpg`, ratio: 1 }))
    const { board } = addImages({ ...emptyBoard(), items: [makeNote({ x: 0, y: 0 }, 'x')] }, refs)
    expect(previewsOf(serializeBoard(board))).toEqual(['t1.jpg', 't3.jpg', 't4.jpg', 't5.jpg'])
    expect(previewsOf(null)).toEqual([])
  })
})
