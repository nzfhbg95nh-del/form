import { describe, expect, it } from 'vitest'
import { vegSwaps } from './vegSwaps'

describe('par quoi remplacer la viande', () => {
  it('propose une piste pour chaque viande, dans l’ordre de la recette', () => {
    const s = vegSwaps(['500 g d’escalope de poulet, coupée en cubes', '100 g de lardons', '2 oignons'])
    expect(s.map((x) => x.meat)).toEqual(['poulet', 'lardons, jambon'])
    expect(s[0].sub).toContain('tofu')
  })
  it('viande hachée : lentilles ou soja, pas aussi « bœuf »', () => {
    expect(vegSwaps(['400 g de bœuf haché']).map((x) => x.meat)).toEqual(['viande hachée'])
  })
  it('rien à remplacer dans une recette sans viande', () => {
    expect(vegSwaps(['200 g de pois chiches', '1 courgette'])).toEqual([])
  })
})
