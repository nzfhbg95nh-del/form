import { describe, expect, it } from 'vitest'
import {
  alignItems, arrangeColumn, arrangeFlow, arrangeGrid, arrangeRow, boundsOf, bringToFront, clampZoom, commit, duplicateItems,
  emptyBoard, expandGroups, fitView, flipItems, groupItems, hitTest, importSize, itemsInRect, looksLikeUrl, moveItems, newHistory,
  normalizeItems, normalizeRect, parseBoard, redo, removeItems, scaleItems, screenToWorld, sendToBack, serializeBoard, undo,
  ungroupItems, worldToScreen, zoomAt, MAX_ZOOM, MIN_ZOOM, type BoardItem,
} from './moodboard'
import { extractPalette, hexToRgb, mergePalettes, readableOn, rgbToHex } from './palette'

const item = (id: string, x: number, y: number, w: number, h: number, extra: Partial<BoardItem> = {}): BoardItem => ({ id, kind: 'image', x, y, w, h, ...extra })
const ids = (...v: string[]) => new Set(v)

describe('zoom et navigation', () => {
  it('convertit écran <-> toile sans perte', () => {
    const view = { x: 120, y: -40, zoom: 2.5 }
    const world = screenToWorld(view, { x: 300, y: 200 })
    expect(worldToScreen(view, world)).toEqual({ x: 300, y: 200 })
  })

  it('zoome autour de la souris : le point sous le curseur reste immobile', () => {
    const view = { x: 50, y: 30, zoom: 1 }
    const mouse = { x: 400, y: 250 }
    const before = screenToWorld(view, mouse)
    const zoomed = zoomAt(view, 1.6, mouse)
    const after = screenToWorld(zoomed, mouse)
    expect(zoomed.zoom).toBeCloseTo(1.6)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('limite le zoom', () => {
    expect(clampZoom(1000)).toBe(MAX_ZOOM)
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(zoomAt({ x: 0, y: 0, zoom: MAX_ZOOM }, 2, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM)
  })

  it('ajuste la vue pour tout voir, centré', () => {
    const view = fitView({ x: 0, y: 0, w: 1000, h: 500 }, { w: 800, h: 600 }, 50)
    expect(view.zoom).toBeCloseTo(0.7)
    const topLeft = worldToScreen(view, { x: 0, y: 0 })
    const bottomRight = worldToScreen(view, { x: 1000, y: 500 })
    expect(topLeft.x).toBeCloseTo(800 - bottomRight.x)
    expect(topLeft.y).toBeCloseTo(600 - bottomRight.y)
    expect(fitView(null, { w: 800, h: 600 })).toEqual({ x: 400, y: 300, zoom: 1 })
    expect(fitView({ x: 0, y: 0, w: 10, h: 10 }, { w: 800, h: 600 }, 50, 1.5).zoom).toBe(1.5)
  })
})

describe('sélection', () => {
  const items = [item('a', 0, 0, 100, 100), item('b', 150, 0, 100, 100), item('c', 500, 500, 50, 50)]

  it('trouve ce qui touche le rectangle de sélection', () => {
    expect(itemsInRect(items, normalizeRect({ x: 90, y: 90 }, { x: 160, y: -10 }))).toEqual(['a', 'b'])
    expect(itemsInRect(items, { x: 300, y: 300, w: 10, h: 10 })).toEqual([])
  })

  it("prend l'élément du dessus sous le curseur", () => {
    const stacked = [item('bas', 0, 0, 100, 100), item('haut', 50, 50, 100, 100)]
    expect(hitTest(stacked, { x: 75, y: 75 })?.id).toBe('haut')
    expect(hitTest(stacked, { x: 10, y: 10 })?.id).toBe('bas')
    expect(hitTest(stacked, { x: 400, y: 400 })).toBeUndefined()
  })

  it('sélectionner un élément groupé sélectionne tout le groupe', () => {
    const grouped = groupItems(items, ids('a', 'c'))
    expect([...expandGroups(grouped, ['a'])].sort()).toEqual(['a', 'c'])
    expect([...expandGroups(grouped, ['b'])]).toEqual(['b'])
    expect(groupItems(items, ids('a'))).toBe(items)
    const loose = ungroupItems(grouped, ids('a', 'c'))
    expect([...expandGroups(loose, ['a'])]).toEqual(['a'])
  })
})

describe('modifications', () => {
  const items = [item('a', 0, 0, 100, 50), item('b', 200, 100, 100, 50)]

  it('déplace, agrandit autour du coin fixe, supprime', () => {
    expect(moveItems(items, ids('a'), 10, -5)[0]).toMatchObject({ x: 10, y: -5 })
    expect(moveItems(items, ids('a'), 10, -5)[1]).toBe(items[1])
    const scaled = scaleItems(items, ids('a', 'b'), { x: 0, y: 0 }, 2, 2)
    expect(scaled[1]).toMatchObject({ x: 400, y: 200, w: 200, h: 100 })
    expect(scaleItems(items, ids('a'), { x: 0, y: 0 }, 0.001, 0.001)[0].w).toBe(8)
    expect(removeItems(items, ids('a')).map((i) => i.id)).toEqual(['b'])
  })

  it("duplique avec de nouveaux identifiants, en gardant les groupes ensemble", () => {
    const grouped = groupItems(items, ids('a', 'b'))
    const { items: out, newIds } = duplicateItems(grouped, ids('a', 'b'))
    expect(out).toHaveLength(4)
    const copies = out.filter((i) => newIds.has(i.id))
    expect(copies[0].group).toBe(copies[1].group)
    expect(copies[0].group).not.toBe(grouped[0].group)
    expect(copies[0]).toMatchObject({ x: 24, y: 24 })
  })

  it("change l'ordre d'empilement et retourne", () => {
    expect(bringToFront(items, ids('a')).map((i) => i.id)).toEqual(['b', 'a'])
    expect(sendToBack(items, ids('b')).map((i) => i.id)).toEqual(['b', 'a'])
    expect(flipItems(items, ids('a'), 'x')[0].flipX).toBe(true)
    expect(flipItems(flipItems(items, ids('a'), 'x'), ids('a'), 'x')[0].flipX).toBe(false)
  })
})

describe('organiser', () => {
  const four = [item('a', 0, 0, 100, 80), item('b', 300, 10, 60, 120), item('c', 20, 400, 100, 100), item('d', 500, 400, 80, 80)]
  const all = ids('a', 'b', 'c', 'd')
  const overlaps = (list: BoardItem[]) => list.some((p, i) => list.slice(i + 1).some((q) => p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y))

  it("range en mosaïque sans chevauchement, depuis le coin haut-gauche d'origine", () => {
    const out = arrangeFlow(four, all, 10)
    expect(overlaps(out)).toBe(false)
    expect(boundsOf(out)!.x).toBe(0)
    expect(boundsOf(out)!.y).toBe(0)
    expect(out.every((i, n) => i.w === four[n].w && i.h === four[n].h)).toBe(true)
  })

  it('range en ligne, en colonne, en grille', () => {
    const row = arrangeRow(four, all, 10)
    expect(row.map((i) => i.y)).toEqual([0, 0, 0, 0])
    expect(row[0].x + row[0].w + 10).toBe(row[1].x)
    const col = arrangeColumn(four, all, 10)
    expect(col.map((i) => i.x)).toEqual([0, 0, 0, 0])
    expect(col[0].y + col[0].h + 10).toBe(col[1].y)
    const grid = arrangeGrid(four, all, 10)
    expect(overlaps(grid)).toBe(false)
    expect(new Set(grid.map((i) => Math.round(i.y + i.h / 2))).size).toBe(2) // 2 rangées de 2
  })

  it("n'organise que la sélection et laisse le reste en place", () => {
    const out = arrangeRow(four, ids('a', 'b'), 10)
    expect(out[2]).toBe(four[2])
    expect(out[3]).toBe(four[3])
  })

  it('met à la même hauteur, largeur ou surface, en gardant les proportions et le centre', () => {
    const items = [item('a', 0, 0, 200, 100), item('b', 400, 0, 100, 100)]
    const h = normalizeItems(items, ids('a', 'b'), 'height')
    expect(h[0].h).toBeCloseTo(h[1].h)
    expect(h[0].w / h[0].h).toBeCloseTo(2)
    expect(h[0].x + h[0].w / 2).toBeCloseTo(100)
    const a = normalizeItems(items, ids('a', 'b'), 'area')
    expect(a[0].w * a[0].h).toBeCloseTo(a[1].w * a[1].h)
    const w = normalizeItems(items, ids('a', 'b'), 'width')
    expect(w[0].w).toBeCloseTo(w[1].w)
    expect(normalizeItems(items, ids('a'), 'height')).toBe(items)
  })

  it('aligne', () => {
    const items = [item('a', 10, 20, 100, 50), item('b', 200, 90, 40, 40)]
    const left = alignItems(items, ids('a', 'b'), 'left')
    expect(left.map((i) => i.x)).toEqual([10, 10])
    expect(alignItems(items, ids('a', 'b'), 'right').map((i) => i.x + i.w)).toEqual([240, 240])
    expect(alignItems(items, ids('a', 'b'), 'top').map((i) => i.y)).toEqual([20, 20])
    expect(alignItems(items, ids('a', 'b'), 'bottom').map((i) => i.y + i.h)).toEqual([130, 130])
    const hc = alignItems(items, ids('a', 'b'), 'hcenter')
    expect(hc[0].x + hc[0].w / 2).toBeCloseTo(hc[1].x + hc[1].w / 2)
    const vc = alignItems(items, ids('a', 'b'), 'vcenter')
    expect(vc[0].y + vc[0].h / 2).toBeCloseTo(vc[1].y + vc[1].h / 2)
  })
})

describe('annuler / rétablir', () => {
  it('revient en arrière et en avant, et oublie le futur après une nouvelle action', () => {
    let h = newHistory<number[]>([])
    h = commit(h, [1])
    h = commit(h, [1, 2])
    expect(h.present).toEqual([1, 2])
    h = undo(h)
    expect(h.present).toEqual([1])
    h = redo(h)
    expect(h.present).toEqual([1, 2])
    h = undo(undo(h))
    expect(h.present).toEqual([])
    expect(undo(h)).toBe(h)
    h = commit(h, [9])
    expect(h.future).toEqual([])
    expect(redo(h)).toBe(h)
  })

  it("ne crée pas d'étape si rien n'a changé, et plafonne la mémoire", () => {
    const base = newHistory<number[]>([])
    expect(commit(base, base.present)).toBe(base)
    let h = base
    for (let i = 0; i < 150; i++) h = commit(h, [i])
    expect(h.past).toHaveLength(100)
  })
})

describe('import et sauvegarde', () => {
  it("réduit les grandes images, jamais ne les agrandit", () => {
    expect(importSize(4000, 2000)).toEqual({ w: 420, h: 210 })
    expect(importSize(200, 100)).toEqual({ w: 200, h: 100 })
    expect(importSize(2000, 4000)).toEqual({ w: 210, h: 420 })
  })

  it('relit une toile enregistrée, et repart de zéro si elle est illisible', () => {
    const board = { ...emptyBoard(), items: [item('a', 1, 2, 3, 4)] }
    expect(parseBoard(serializeBoard(board))).toEqual(board)
    expect(parseBoard(null)).toEqual(emptyBoard())
    expect(parseBoard('n importe quoi')).toEqual(emptyBoard())
    expect(parseBoard('{"v":2}')).toEqual(emptyBoard())
  })

  it('reconnaît les adresses web', () => {
    expect(looksLikeUrl('https://exemple.fr/page?x=1')).toBe(true)
    expect(looksLikeUrl(' http://a.b ')).toBe(true)
    expect(looksLikeUrl('du texte https://a.b')).toBe(false)
    expect(looksLikeUrl('exemple.fr')).toBe(false)
  })
})

describe('palette de couleurs', () => {
  const pixels = (colors: [number, number, number, number][], each: number) => Uint8ClampedArray.from(colors.flatMap((c) => Array.from({ length: each }, () => c).flat()))

  it('retrouve les couleurs dominantes, la plus fréquente en premier', () => {
    const data = pixels([[255, 0, 0, 255]], 60)
    const withBlue = Uint8ClampedArray.from([...data, ...pixels([[0, 0, 255, 255]], 30)])
    const palette = extractPalette(withBlue, 2)
    expect(palette).toEqual(['#ff0000', '#0000ff'])
  })

  it('ignore les pixels transparents et une image vide', () => {
    expect(extractPalette(pixels([[10, 20, 30, 0]], 50), 4)).toEqual([])
    expect(extractPalette(new Uint8ClampedArray(), 4)).toEqual([])
    expect(extractPalette(pixels([[0, 255, 0, 255], [1, 2, 3, 0]], 20), 3)).toEqual(['#00ff00'])
  })

  it('ne dépasse pas le nombre demandé et ne répète pas une couleur', () => {
    const many = Uint8ClampedArray.from(Array.from({ length: 400 }, (_, i) => [i % 256, (i * 7) % 256, (i * 13) % 256, 255]).flat())
    const palette = extractPalette(many, 5)
    expect(palette.length).toBeLessThanOrEqual(5)
    expect(new Set(palette).size).toBe(palette.length)
    expect(extractPalette(pixels([[9, 9, 9, 255]], 100), 6)).toEqual(['#090909'])
  })

  it('fusionne plusieurs palettes sans couleurs presque identiques', () => {
    expect(mergePalettes([['#ff0000', '#ff0505'], ['#00ff00', '#ff0000']], 8)).toEqual(['#ff0000', '#00ff00'])
    expect(mergePalettes([['#111111', '#999999', '#eeeeee']], 2)).toEqual(['#111111', '#999999'])
  })

  it('convertit les couleurs et choisit un texte lisible', () => {
    expect(rgbToHex({ r: 255, g: 128, b: 0 })).toBe('#ff8000')
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 })
    expect(hexToRgb('zzz')).toBeNull()
    expect(readableOn('#ffffff')).toBe('#111111')
    expect(readableOn('#101010')).toBe('#ffffff')
  })
})
