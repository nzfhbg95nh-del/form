import { describe, expect, it } from 'vitest'
import { applyVcPaths, isEngineTool, itemToVcPath, type VcPath } from './vectorEngine'
import { penToItem } from './boardPath'
import { DEFAULT_SHAPE_STYLE } from './boardShapes'
import type { BoardItem } from './moodboard'

const line = (id: string, y = 0): VcPath => ({ id, closed: false, points: [{ x: 0, y, ix: 0, iy: 0, ox: 0, oy: 0 }, { x: 100, y, ix: 0, iy: 0, ox: 0, oy: 0 }] })
const image: BoardItem = { id: 'img', kind: 'image', x: 0, y: 0, w: 10, h: 10 }

describe('pont avec le moteur de dessin', () => {
  it('reconnaît les outils du moteur', () => {
    expect(isEngineTool('pen')).toBe(true)
    expect(isEngineTool('select')).toBe(false)
  })
  it('un tracé que le moteur a créé devient un nouvel élément, les autres éléments ne bougent pas', () => {
    const out = applyVcPaths([image], [line('vc7')], DEFAULT_SHAPE_STYLE)
    expect(out).toHaveLength(2)
    expect(out[0]).toBe(image)
    expect(out[1].id).toBe('vc7')
    expect(out[1].shape).toBe('path')
  })
  it('un tracé inchangé garde le même élément (pas de nouvel historique pour rien)', () => {
    const it = { ...penToItem(line('a').points, false, DEFAULT_SHAPE_STYLE), id: 'a' }
    const out = applyVcPaths([it], [itemToVcPath(it)], DEFAULT_SHAPE_STYLE)
    expect(out[0]).toBe(it)
  })
  it('un tracé que le moteur a modifié ou supprimé est mis à jour ou retiré', () => {
    const a = { ...penToItem(line('a').points, false, DEFAULT_SHAPE_STYLE), id: 'a', color: '#ff0000' }
    const b = { ...penToItem(line('b', 50).points, false, DEFAULT_SHAPE_STYLE), id: 'b' }
    const moved = applyVcPaths([a, b], [line('a', 30)], DEFAULT_SHAPE_STYLE)
    expect(moved).toHaveLength(1)
    expect(moved[0].id).toBe('a')
    expect(moved[0].y).toBe(30)
    expect(moved[0].color).toBe('#ff0000')
  })
  it('le deuxième morceau d’un tracé coupé garde le style du tracé d’origine', () => {
    const a = { ...penToItem(line('a').points, false, DEFAULT_SHAPE_STYLE), id: 'a', color: '#00ff00' }
    const out = applyVcPaths([a], [line('a'), line('a#1', 5)], DEFAULT_SHAPE_STYLE)
    expect(out).toHaveLength(2)
    expect(out[1].id).toBe('a#1')
    expect(out[1].color).toBe('#00ff00')
  })
})
