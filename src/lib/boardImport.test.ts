import { describe, expect, it } from 'vitest'
import { classifyLink, imageTypeOf, importMessage } from './boardImport'
import { arrowHead, makeShape, makeText } from './moodboard'

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
