import { describe, expect, it } from 'vitest'
import { blockActions, colorActions, filterBlockActions } from './blockActions'

const all = blockActions({ withText: true, textColor: true, backgroundColor: true, single: true })

describe('blockActions', () => {
  it('propose transformer, couleurs, dupliquer, déplacer, lien et supprimer', () => {
    const groups = new Set(all.map((a) => a.group))
    expect(groups).toEqual(new Set(['Transformer en', 'Couleur', 'Actions']))
    expect(all.map((a) => a.key)).toEqual(expect.arrayContaining(['turn-h1', 'text-red', 'background-blue', 'duplicate', 'move', 'link', 'delete']))
  })
  it('plusieurs blocs : pas de « Copier le lien du bloc »', () => {
    const many = blockActions({ withText: true, textColor: true, backgroundColor: true, single: false })
    expect(many.some((a) => a.key === 'link')).toBe(false)
  })
  it('une image (sans texte ni couleur) : seulement les actions générales', () => {
    const img = blockActions({ withText: false, textColor: false, backgroundColor: false, single: true })
    expect(img.map((a) => a.key)).toEqual(['duplicate', 'move', 'link', 'delete'])
  })
  it('10 couleurs de texte et 10 de fond', () => {
    expect(colorActions()).toHaveLength(20)
  })
})

describe('filterBlockActions', () => {
  it('« rouge » trouve le texte et le fond rouges', () => {
    expect(filterBlockActions(all, 'rouge').map((a) => a.key)).toEqual(['text-red', 'background-red'])
  })
  it('« fond rou » ne trouve que le fond rouge', () => {
    expect(filterBlockActions(all, 'fond rou').map((a) => a.key)).toEqual(['background-red'])
  })
  it('les mots anglais de Notion marchent aussi (red background, delete)', () => {
    expect(filterBlockActions(all, 'red background').map((a) => a.key)).toEqual(['background-red'])
    expect(filterBlockActions(all, 'delete').map((a) => a.key)).toEqual(['delete'])
  })
  it('sans accent ni majuscule', () => {
    expect(filterBlockActions(all, 'DEPLACER').map((a) => a.key)).toEqual(['move'])
  })
  it('« titre 2 » trouve le titre 2 (et le titre déroulant 2)', () => {
    expect(filterBlockActions(all, 'titre 2').map((a) => a.key)).toEqual(['turn-h2', 'turn-th2'])
  })
  it('sans recherche, tout est proposé', () => {
    expect(filterBlockActions(all, '  ')).toHaveLength(all.length)
  })
})
