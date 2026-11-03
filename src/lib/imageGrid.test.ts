import { describe, expect, it } from 'vitest'
import { gridColumns, imageGrid } from './blockSelection'

const imgs = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'image', props: { url: `u${i}` } }))
type List = { type: string; children: { type: string; children: { props: { url: string } }[] }[] }
const urls = (rows: object[]) => (rows[0] as List).children.map((c) => c.children.map((i) => i.props.url))

describe('images rangées en grille façon Pinterest', () => {
  it('moins de deux images : rien à ranger', () => {
    expect(imageGrid([])).toEqual([])
    expect(imageGrid(imgs(1))).toEqual([])
  })
  it('2 colonnes pour 2 images, 3 ensuite', () => {
    expect(gridColumns(2)).toBe(2)
    expect(gridColumns(3)).toBe(3)
    expect(gridColumns(20)).toBe(3)
  })
  it('une seule liste de colonnes', () => {
    const rows = imageGrid(imgs(7))
    expect(rows).toHaveLength(1)
    expect((rows[0] as List).type).toBe('columnList')
  })
  it('sans proportions connues, les images se répartissent à tour de rôle', () => {
    expect(urls(imageGrid(imgs(7)))).toEqual([['u0', 'u3', 'u6'], ['u1', 'u4'], ['u2', 'u5']])
  })
  it('une image haute remplit sa colonne : les suivantes vont dans les colonnes moins hautes', () => {
    expect(urls(imageGrid(imgs(5), [3, 1, 1, 1, 1]))).toEqual([['u0'], ['u1', 'u3'], ['u2', 'u4']])
  })
  it('toutes les images sont gardées, une seule fois', () => {
    expect(urls(imageGrid(imgs(11), [1, 2, 0.5, 1.5, 1, 1, 3, 1, 1, 0.7, 1])).flat().sort()).toEqual(imgs(11).map((i) => i.props.url).sort())
  })
})
