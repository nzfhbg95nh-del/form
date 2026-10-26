import { describe, expect, it } from 'vitest'
import { applyVcPaths, fillOf, isEngineTool, itemToVcPath, strokeOf, type VcPath } from './vectorEngine'
import { penToItem } from './boardPath'
import { DEFAULT_SHAPE_STYLE } from './boardShapes'
import type { BoardItem } from './moodboard'

const line = (id: string, y = 0, extra: Partial<VcPath> = {}): VcPath => ({
  id, closed: false, fill: null, stroke: '#111111', sw: 2, subs: [],
  points: [{ x: 0, y, ix: 0, iy: 0, ox: 0, oy: 0 }, { x: 100, y, ix: 0, iy: 0, ox: 0, oy: 0 }], ...extra,
})
const image: BoardItem = { id: 'img', kind: 'image', x: 0, y: 0, w: 10, h: 10 }
/** Un tracé du moodboard tel que le moteur le décrit. */
const made = (p: VcPath): BoardItem => applyVcPaths([], [p])[0]

describe('pont avec le moteur de dessin', () => {
  it('les outils de Form restent à Form, les autres sont ceux du moteur', () => {
    expect(isEngineTool('pen')).toBe(true)
    expect(isEngineTool('select')).toBe(false)
    expect(isEngineTool('text')).toBe(false)
    expect(isEngineTool('hand')).toBe(false)
    expect(isEngineTool('directSelection')).toBe(true)
  })
  it('un tracé que le moteur a créé devient un nouvel élément avec son style, les autres éléments ne bougent pas', () => {
    const out = applyVcPaths([image], [line('vc7', 0, { fill: '#00ff00', stroke: '#0000ff', sw: 4 })])
    expect(out).toHaveLength(2)
    expect(out[0]).toBe(image)
    expect(out[1].id).toBe('vc7')
    expect(out[1].shape).toBe('path')
    expect(fillOf(out[1])).toBe('#00ff00')
    expect(strokeOf(out[1])).toEqual({ color: '#0000ff', sw: 4 })
  })
  it('un tracé sans contour a une épaisseur nulle, un tracé sans remplissage n’a pas de couleur de fond', () => {
    const it = made(line('a', 0, { stroke: null, fill: '#ff0000' }))
    expect(strokeOf(it).sw).toBe(0)
    expect(strokeOf(it).color).toBeNull()
    expect(fillOf(made(line('b')))).toBeNull()
  })
  it('un tracé inchangé garde le même élément (pas de nouvel historique pour rien)', () => {
    const it = made(line('a'))
    const out = applyVcPaths([it], [itemToVcPath(it)])
    expect(out[0]).toBe(it)
  })
  it('un tracé que le moteur a modifié (forme ou style) est mis à jour, un tracé supprimé est retiré', () => {
    const a = made(line('a'))
    const b = made(line('b', 50))
    const moved = applyVcPaths([a, b], [line('a', 30, { stroke: '#ff0000' })])
    expect(moved).toHaveLength(1)
    expect(moved[0].id).toBe('a')
    expect(moved[0].y).toBe(30)
    expect(strokeOf(moved[0]).color).toBe('#ff0000')
  })
  it('un tracé de l’ancien format (« filled ») garde son remplissage en passant au moteur', () => {
    const old = { ...penToItem(line('a').points, true, DEFAULT_SHAPE_STYLE), id: 'a', color: '#ff0000', filled: true, fill: undefined }
    expect(itemToVcPath(old).fill).toBe('#ff0000')
  })
  it('un tracé avec un trou (une tache qui fait une boucle) reste un seul élément, le trou est un autre morceau', () => {
    const hole = { closed: true, points: [{ x: 20, y: 20, ix: 0, iy: 0, ox: 0, oy: 0 }, { x: 60, y: 20, ix: 0, iy: 0, ox: 0, oy: 0 }, { x: 40, y: 60, ix: 0, iy: 0, ox: 0, oy: 0 }] }
    const it = made(line('a', 0, { closed: true, subs: [hole] }))
    expect(it.sub).toHaveLength(1)
    expect(itemToVcPath(it).subs).toHaveLength(1)
    // inchangé : même élément
    expect(applyVcPaths([it], [itemToVcPath(it)])[0]).toBe(it)
    const out = applyVcPaths([it], [line('a', 0, { closed: true, subs: [] })])
    expect(out[0].sub).toBeUndefined()
  })
})
