import { describe, expect, it } from 'vitest'
import { forageAlerts, forageCalendar, forageStatus, PLANTS, windowLabel } from './forage'

const plant = (id: string) => PLANTS.find((p) => p.id === id)!
const recipes = [
  { id: 's', title: 'Sirop de fleurs de sureau', text: '20 ombelles de sureau, 1 kg de sucre, 2 citrons' },
  { id: 't', title: 'Tisane maison', text: '18 g de fruits de tilleul séchés' },
  { id: 'l', title: 'Gelée de lilas', text: '250 g de fleurs de lilas' },
  { id: 'c', title: 'Curry', text: '2 oignons' },
]

describe('cueillette', () => {
  it('pas de fausse alerte : « sortie » n’est pas une ortie, « fraises bien mûres » ne sont pas des mûres', () => {
    const r = [{ id: 'a', title: 'Mochi aux fraises', text: '200 g de fraises bien mûres, à la sortie du four' }, { id: 'b', title: 'Crumble', text: '300 g de mûres' }]
    expect(forageCalendar(r).map((c) => c.plant.id)).toEqual(['mure'])
  })
  it('c’est le moment pendant la période, avec les jours qui restent', () => {
    expect(forageStatus(plant('sureau-fleur'), new Date(2026, 5, 1))).toEqual({ status: 'now', days: 29 })
  })
  it('bientôt dans le mois qui précède', () => {
    expect(forageStatus(plant('sureau-fleur'), new Date(2026, 4, 1))).toEqual({ status: 'soon', days: 14 })
    expect(forageStatus(plant('sureau-fleur'), new Date(2026, 2, 1))).toBeNull()
  })
  it('passe d’une année à l’autre (décembre → ail des ours en mars : pas encore « bientôt »)', () => {
    expect(forageStatus(plant('ail-ours'), new Date(2026, 11, 20))).toBeNull()
    expect(forageStatus(plant('ail-ours'), new Date(2027, 1, 15))).toEqual({ status: 'soon', days: 14 })
  })
  it('ne prévient que pour les plantes de tes recettes', () => {
    const mai = forageAlerts(recipes, new Date(2026, 4, 20))
    expect(mai.map((a) => a.plant.id)).toEqual(['lilas', 'sureau-fleur'])
    expect(mai[0]).toMatchObject({ status: 'now', recipes: [{ id: 'l', title: 'Gelée de lilas' }] })
    const aout = forageAlerts(recipes, new Date(2026, 7, 10))
    expect(aout.find((a) => a.plant.id === 'tilleul-fruit')?.recipes.map((r) => r.id)).toEqual(['t'])
    expect(aout.find((a) => a.plant.id === 'tilleul-fleur')).toBeUndefined()
  })
  it('le calendrier de l’année, dans l’ordre', () => {
    expect(forageCalendar(recipes).map((c) => c.plant.id)).toEqual(['lilas', 'sureau-fleur', 'tilleul-fruit'])
    expect(windowLabel(plant('sureau-fleur'))).toBe('du 15 mai au 30 juin')
  })
})
