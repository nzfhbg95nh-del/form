import { describe, expect, it } from 'vitest'
import { dishTitle, swapOf, variantInfo, variantSection, vegTitle } from './vegTitle'

const t = (text: string) => [{ type: 'text', text }]
const page = (heading: string, intro: string) => [
  { type: 'heading', props: { level: 2 }, content: t('Ingrédients') },
  { type: 'bulletListItem', content: t('500 g de poulet') },
  { type: 'heading', props: { level: 2 }, content: t(heading) },
  { type: 'paragraph', content: t(intro) },
  { type: 'heading', props: { level: 3 }, content: t('Ingrédients de cette version') },
]
const veg = (title: string, intro: string, heading = 'Version sans viande') => vegTitle(title, variantInfo(page(heading, intro)))

describe('nom végé', () => {
  it('lit la phrase « … est remplacé par … »', () => {
    expect(swapOf('Le poulet est remplacé par du tofu ferme mariné (ou du paneer) : la marinade reste la même.')).toEqual({ meat: 'poulet', sub: 'tofu ferme' })
    expect(swapOf('Le bœuf haché est remplacé par un mélange lentilles brunes, champignons et noix.')).toEqual({ meat: 'bœuf haché', sub: 'lentilles brunes' })
    expect(swapOf('Le poulet katsu devient un katsu de tofu ferme, et le bouillon de poulet un bouillon de légumes.')).toEqual({ meat: 'poulet katsu', sub: 'katsu de tofu ferme' })
  })
  it('remplace la viande ou le poisson dans le titre, avec la bonne préposition', () => {
    expect(veg('Poulet tikka masala', 'Le poulet est remplacé par du tofu ferme mariné.')).toBe('Tofu ferme tikka masala')
    expect(veg('Butter chicken et naan au fromage', 'Le poulet est remplacé par du paneer.')).toBe('Butter paneer et naan au fromage')
    expect(veg('Pâtes au saumon fumé et brocolis', 'Le saumon fumé est remplacé par du tofu fumé émietté et des noix.', 'Version sans poisson')).toBe('Pâtes au tofu fumé et brocolis')
    expect(veg('Arayes palestiniens (pita à la viande) et tzatziki', 'Le bœuf haché est remplacé par un mélange lentilles brunes, champignons.')).toBe('Arayes palestiniens (pita aux lentilles brunes) et tzatziki')
    expect(veg('Pâté de sardines', 'Les sardines sont remplacées par des pois chiches.', 'Version sans poisson')).toBe('Pâté de pois chiches')
    expect(veg('Cabillaud, riz et ratatouille', 'Le cabillaud est remplacé par des haricots blancs (ou des pois chiches).', 'Version sans poisson')).toBe('Haricots blancs, riz et ratatouille')
  })
  it('sans viande dans le titre : le précise entre parenthèses', () => {
    expect(veg('Curry japonais maison', 'Le poulet katsu devient un katsu de tofu ferme.')).toBe('Curry japonais maison (végé : katsu de tofu ferme)')
  })
  it('un nom écrit dans le titre de la section l’emporte', () => {
    expect(veg('Poulet tikka masala', 'Le poulet est remplacé par du tofu.', 'Version sans viande : Tikka masala de tofu')).toBe('Tikka masala de tofu')
  })
  it('une recette sans version sans viande garde son nom', () => {
    expect(dishTitle({ id: 'a', title: 'Dahl', content: JSON.stringify([{ type: 'paragraph', content: t('lentilles') }]) })).toBe('Dahl')
    expect(dishTitle({ id: 'b', title: 'Poulet tikka masala', content: JSON.stringify(page('Version sans viande', 'Le poulet est remplacé par du tofu ferme mariné.')) })).toBe('Tofu ferme tikka masala')
  })
})

describe('encadré végé', () => {
  it('lit toute la section : phrase, puis chaque partie, jusqu’au titre suivant du même niveau', () => {
    const blocks = [
      { type: 'heading', props: { level: 2 }, content: t('Ingrédients') },
      { type: 'bulletListItem', content: t('500 g de poulet') },
      { type: 'heading', props: { level: 2 }, content: t('Version sans viande') },
      { type: 'paragraph', content: t('Le poulet est remplacé par du paneer.') },
      { type: 'heading', props: { level: 3 }, content: t('Ingrédients de cette version') },
      { type: 'bulletListItem', content: t('400 g de paneer') },
      { type: 'heading', props: { level: 3 }, content: t('Ce qui change') },
      { type: 'bulletListItem', content: t('Pas de marinade longue') },
      { type: 'heading', props: { level: 2 }, content: t('Notes') },
      { type: 'paragraph', content: t('À servir chaud') },
    ]
    expect(variantSection(blocks)).toEqual({
      heading: 'Version sans viande',
      intro: 'Le poulet est remplacé par du paneer.',
      parts: [{ title: 'Ingrédients de cette version', lines: ['400 g de paneer'] }, { title: 'Ce qui change', lines: ['Pas de marinade longue'] }],
    })
  })
  it('pas de section : rien', () => {
    expect(variantSection([{ type: 'paragraph', content: t('Recette') }])).toBeNull()
  })
})
