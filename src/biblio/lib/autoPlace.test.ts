import { describe, expect, it } from 'vitest'
import { pickCollection, type Candidate } from './autoPlace.ts'

/** Un vecteur unitaire dans un plan : l'angle donne la « ressemblance ». */
const v = (deg: number): number[] => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]
const c = (deg: number, ...collections: string[]): Candidate => ({ vec: v(deg), collections })

describe('collection trouvée par l’IA pour une image ajoutée', () => {
  const candidates = [c(0, 'affiches'), c(5, 'affiches'), c(10, 'affiches'), c(90, 'objets'), c(95, 'objets'), c(100, 'objets', 'produits')]

  it('choisit la collection des images qui lui ressemblent le plus', () => {
    expect(pickCollection(v(3), candidates)?.collectionId).toBe('affiches')
    expect(pickCollection(v(92), candidates)?.collectionId).toBe('objets')
  })

  it('ne choisit rien quand aucune image ne lui ressemble assez', () => {
    // à 45° : aucune voisine n'est proche (cosinus ≈ 0,7 au mieux : on monte le seuil pour le test)
    expect(pickCollection(v(45), candidates, { k: 6, minSim: 0.9, minShare: 0.4 })).toBeNull()
    expect(pickCollection(v(0), [])).toBeNull()
  })

  it('ne choisit rien quand les voisines se partagent entre trop de collections', () => {
    const mixed = [c(0, 'a'), c(1, 'b'), c(2, 'c'), c(3, 'd'), c(4, 'e')]
    expect(pickCollection(v(2), mixed, { k: 5, minSim: 0.5, minShare: 0.4 })).toBeNull()
  })

  it('donne la part des voisines et leur ressemblance', () => {
    const r = pickCollection(v(3), candidates, { k: 3, minSim: 0.5, minShare: 0.4 })!
    expect(r.share).toBeCloseTo(1)
    expect(r.sim).toBeGreaterThan(0.99)
  })
})
