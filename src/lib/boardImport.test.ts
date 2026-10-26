import { describe, expect, it } from 'vitest'
import { classifyLink, imageTypeOf, importMessage } from './boardImport'
import { arrowHead, boundsOf, bringForward, handlePoint, hitTest, itemBounds, makeShape, makeText, resizeRotated, resizeScale, rotateItems, rotatePoint, sendBackward, snapMove, snapRotation, type BoardItem } from './moodboard'

describe('classifyLink', () => {
  it('reconnaît un tableau Pinterest, avec ou sans suite de paramètres', () => {
    expect(classifyLink('https://www.pinterest.com/DYSARTADD/art-graphic/?x=1').info).toEqual({ site: 'pinterest', kind: 'board', url: 'https://www.pinterest.com/DYSARTADD/art-graphic/' })
    expect(classifyLink('fr.pinterest.com/eva/mode/').info?.kind).toBe('board')
  })
  it('reconnaît une épingle Pinterest', () => {
    expect(classifyLink('https://www.pinterest.com/pin/123456/').info).toEqual({ site: 'pinterest', kind: 'pin', url: 'https://www.pinterest.com/pin/123456/' })
    expect(classifyLink('https://pin.it/AbCd').info?.kind).toBe('pin')
  })
  it('refuse un profil entier pour ne pas lancer un énorme téléchargement', () => {
    const r = classifyLink('https://www.pinterest.com/DYSARTADD/')
    expect(r.info).toBeNull()
    expect(r.problem).toContain('tableau précis')
  })
  it('reconnaît un post Instagram et refuse un profil ou une vidéo', () => {
    expect(classifyLink('https://www.instagram.com/p/DdjbICzoxZg/?img_index=2').info).toEqual({ site: 'instagram', kind: 'post', url: 'https://www.instagram.com/p/DdjbICzoxZg/' })
    expect(classifyLink('https://www.instagram.com/dsrt.add/').problem).toContain('post Instagram')
    expect(classifyLink('https://www.instagram.com/reel/XYZ/').problem).toContain('vidéos')
  })
  it('refuse le reste', () => {
    expect(classifyLink('').problem).toContain('Colle un lien')
    expect(classifyLink('https://exemple.fr/page').problem).toContain('Pinterest et Instagram')
  })
})

describe('imageTypeOf et importMessage', () => {
  it('ne garde que des images lisibles', () => {
    expect(imageTypeOf('C:\\tmp\\1234.JPG')).toBe('image/jpeg')
    expect(imageTypeOf('/tmp/a.webp')).toBe('image/webp')
    expect(imageTypeOf('/tmp/a.mp4')).toBeNull()
    expect(imageTypeOf('/tmp/sansextension')).toBeNull()
  })
  it('dit ce qui a été ajouté', () => {
    expect(importMessage(1, 0)).toBe('1 image ajoutée.')
    expect(importMessage(12, 2)).toBe('12 images ajoutées (2 fichiers ignorés).')
    expect(importMessage(100, 0)).toContain('limite de 100 atteinte')
    expect(importMessage(0, 3)).toBe('Aucune image lisible dans ce lien.')
  })
})

describe('nouveaux éléments de la toile', () => {
  it('un texte a une taille de lettres et pas de fond', () => {
    const t = makeText({ x: 10, y: 20 }, 'Bonjour')
    expect(t).toMatchObject({ kind: 'text', x: 10, y: 20, text: 'Bonjour', size: 32 })
  })
  it('une forme est centrée sur le point choisi', () => {
    const r = makeShape({ x: 100, y: 100 }, 'rect')
    expect(r).toMatchObject({ kind: 'shape', shape: 'rect', w: 200, h: 140, x: 0, y: 30, filled: false })
    expect(makeShape({ x: 0, y: 0 }, 'arrow')).toMatchObject({ shape: 'arrow', w: 240, h: 120 })
  })
  it('la pointe d\'une flèche finit au bout du trait', () => {
    const head = arrowHead(0, 0, 100, 0, 20)
    expect(head[0]).toEqual([100, 0])
    // les deux autres points sont en arrière du bout, de part et d'autre du trait
    expect(head[1][0]).toBeLessThan(100)
    expect(head[2][0]).toBeLessThan(100)
    expect(head[1][1]).toBeCloseTo(-head[2][1], 5)
  })
})

const box = { x: 0, y: 0, w: 100, h: 50 }
const mk = (id: string): BoardItem => ({ id, kind: 'note', x: 0, y: 0, w: 10, h: 10 })

describe('poignées', () => {
  it('huit poignées : coins et milieux des côtés', () => {
    expect(handlePoint(box, 'nw')).toEqual({ x: 0, y: 0 })
    expect(handlePoint(box, 'se')).toEqual({ x: 100, y: 50 })
    expect(handlePoint(box, 'n')).toEqual({ x: 50, y: 0 })
    expect(handlePoint(box, 'e')).toEqual({ x: 100, y: 25 })
  })
  it('un coin agrandit dans les deux sens autour du coin opposé', () => {
    expect(resizeScale(box, 'se', { x: 200, y: 75 })).toEqual({ anchor: { x: 0, y: 0 }, fx: 2, fy: 1.5 })
  })
  it('un côté agrandit dans un seul sens', () => {
    const r = resizeScale(box, 'e', { x: 150, y: 999 })
    expect(r).toEqual({ anchor: { x: 0, y: 25 }, fx: 1.5, fy: 1 })
    expect(resizeScale(box, 'n', { x: 999, y: -50 })).toMatchObject({ fx: 1, fy: 2, anchor: { x: 50, y: 50 } })
  })
  it('Alt agrandit depuis le centre', () => {
    expect(resizeScale(box, 'se', { x: 150, y: 75 }, { alt: true })).toEqual({ anchor: { x: 50, y: 25 }, fx: 2, fy: 2 })
  })
  it('Maj garde les proportions (coin et côté)', () => {
    const corner = resizeScale(box, 'se', { x: 200, y: 50 }, { uniform: true })
    expect(corner.fx).toBeCloseTo(corner.fy, 10)
    const side = resizeScale(box, 'e', { x: 200, y: 0 }, { uniform: true })
    expect(side.fx).toBe(2)
    expect(side.fy).toBe(2)
  })
  it('on ne retourne jamais l\'élément', () => {
    expect(resizeScale(box, 'e', { x: -500, y: 0 }).fx).toBe(0.05)
  })
})

describe('ordre des éléments', () => {
  const ids = (list: BoardItem[]) => list.map((i) => i.id).join('')
  const abcd = [mk('a'), mk('b'), mk('c'), mk('d')]
  it('avance d\'un cran, ensemble, sans toucher à ce qui est déjà devant', () => {
    expect(ids(bringForward(abcd, new Set(['a'])))).toBe('bacd')
    expect(ids(bringForward(abcd, new Set(['a', 'b'])))).toBe('cabd')
    expect(ids(bringForward(abcd, new Set(['d'])))).toBe('abcd')
  })
  it('recule d\'un cran', () => {
    expect(ids(sendBackward(abcd, new Set(['d'])))).toBe('abdc')
    expect(ids(sendBackward(abcd, new Set(['c', 'd'])))).toBe('acdb')
    expect(ids(sendBackward(abcd, new Set(['a'])))).toBe('abcd')
  })
})

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)

describe('rotation', () => {
  it('tourne un point autour d\'un centre, dans le sens des aiguilles d\'une montre', () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90)
    near(p.x, 0)
    near(p.y, 10)
  })
  it('les limites d\'un élément tourné de 90° échangent largeur et hauteur autour du centre', () => {
    const b = itemBounds({ x: 0, y: 0, w: 100, h: 50, rot: 90 })
    near(b.w, 50)
    near(b.h, 100)
    near(b.x, 25)
    near(b.y, -25)
  })
  it('boundsOf et la sélection au rectangle tiennent compte de la rotation', () => {
    const b = boundsOf([{ x: 0, y: 0, w: 100, h: 50, rot: 90 }])
    near(b?.w ?? 0, 50)
  })
  it('on clique sur ce qui est visible, pas sur l\'ancien cadre non tourné', () => {
    const tall: BoardItem = { id: 'r', kind: 'note', x: 0, y: 0, w: 100, h: 20, rot: 90 }
    expect(hitTest([tall], { x: 50, y: 50 })?.id).toBe('r') // le milieu du rectangle tourné
    expect(hitTest([tall], { x: 5, y: 10 })).toBeUndefined() // un coin de l'ancien cadre, maintenant vide
  })
  it('rotateItems fait tourner chaque élément sur lui-même et autour du centre commun', () => {
    const a: BoardItem = { id: 'a', kind: 'note', x: 90, y: -10, w: 20, h: 20 } // centré en (100, 0)
    const [out] = rotateItems([a], new Set(['a']), { x: 0, y: 0 }, 90)
    near(out.x + out.w / 2, 0)
    near(out.y + out.h / 2, 100)
    expect(out.rot).toBe(90)
  })
  it('l\'angle reste entre 0 et 360 et Maj arrondit de 15° en 15°', () => {
    const a: BoardItem = { id: 'a', kind: 'note', x: 0, y: 0, w: 10, h: 10, rot: 350 }
    expect(rotateItems([a], new Set(['a']), { x: 5, y: 5 }, 20)[0].rot).toBe(10)
    expect(snapRotation(37)).toBe(30)
    expect(snapRotation(38)).toBe(45)
  })
  it('redimensionner un élément tourné se fait dans son propre repère', () => {
    const a: BoardItem = { id: 'a', kind: 'note', x: 0, y: 0, w: 100, h: 50, rot: 90 } // centre (50, 25)
    // le côté droit (poignée « e ») de l'élément tourné de 90° est tourné vers le bas de l'écran : on tire vers le bas pour l'allonger
    const { item, fx, fy } = resizeRotated(a, 'e', { x: 50, y: 25 + 100 })
    near(fx, 1.5)
    near(fy, 1)
    near(item.w, 150)
    near(item.h, 50)
    near(item.rot ?? 0, 90)
  })
})

describe('guides intelligents', () => {
  const other = { x: 100, y: 100, w: 50, h: 50 }
  it('aimante le bord gauche sur le bord gauche d\'un autre, sous le seuil', () => {
    const r = snapMove({ x: 102, y: 300, w: 10, h: 40 }, [other], 6)
    expect(r.dx).toBe(-2)
    expect(r.guides.some((g) => g.axis === 'x' && g.pos === 100)).toBe(true)
  })
  it('aimante aussi les centres, et choisit l\'alignement le plus proche', () => {
    const r = snapMove({ x: 107, y: 300, w: 30, h: 30 }, [other], 6) // centre 122 -> centre de l'autre : 125
    expect(r.dx).toBe(3)
    expect(r.dy).toBe(0)
  })
  it('ne bouge pas au-delà du seuil et ne montre aucun guide', () => {
    const r = snapMove({ x: 300, y: 300, w: 40, h: 40 }, [other], 6)
    expect(r).toEqual({ dx: 0, dy: 0, guides: [] })
  })
  it('le trait d\'alignement relie les deux éléments', () => {
    const r = snapMove({ x: 100, y: 300, w: 40, h: 40 }, [other], 6)
    const g = r.guides.find((x) => x.axis === 'x' && x.pos === 100)
    expect(g?.from).toBe(100)
    expect(g?.to).toBe(340)
  })
})
