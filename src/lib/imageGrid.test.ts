import { describe, expect, it } from 'vitest'
import { imageGrid } from './blockSelection'

const imgs = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'image', props: { url: `u${i}` } }))
type Row = { type: string; children: { type: string; children: { type: string }[] }[] }

describe('images rangées en grille', () => {
  it('moins de deux images : rien à ranger', () => {
    expect(imageGrid([])).toEqual([])
    expect(imageGrid(imgs(1))).toEqual([])
  })
  it('trois images : une ligne de trois colonnes', () => {
    const rows = imageGrid(imgs(3)) as Row[]
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('columnList')
    expect(rows[0].children.map((c) => c.children[0].type)).toEqual(['image', 'image', 'image'])
  })
  it('sept images : 4 puis 3 + une colonne vide pour garder la même taille', () => {
    const rows = imageGrid(imgs(7)) as Row[]
    expect(rows).toHaveLength(2)
    expect(rows[0].children).toHaveLength(4)
    expect(rows[1].children.map((c) => c.children[0].type)).toEqual(['image', 'image', 'image', 'paragraph'])
  })
  it('huit images : deux lignes pleines, dans l’ordre', () => {
    const rows = imageGrid(imgs(8)) as unknown as { children: { children: { props: { url: string } }[] }[] }[]
    expect(rows.map((r) => r.children.map((c) => c.children[0].props.url))).toEqual([['u0', 'u1', 'u2', 'u3'], ['u4', 'u5', 'u6', 'u7']])
  })
  it('deux images : deux colonnes seulement (pas de vides)', () => {
    expect((imageGrid(imgs(2)) as Row[])[0].children).toHaveLength(2)
  })
})
