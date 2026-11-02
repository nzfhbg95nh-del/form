import { describe, expect, it } from 'vitest'
import { activeMinutes, estimateFromCounts, estimatePrep, missingTimes, readRecipe } from './recipeTimes'

describe('temps actif d\'un texte de notes', () => {
  it('garde la préparation, pas la cuisson ni le repos', () => {
    expect(activeMinutes('15 min + 35 min de cuisson')).toBe(15)
    expect(activeMinutes('5 min de mixage + 30 min de repos')).toBe(5)
    expect(activeMinutes('10 min + 20 à 30 min au frais')).toBe(10)
    expect(activeMinutes('20 min')).toBe(20)
  })

  it('ne trouve rien quand tout est passif', () => {
    expect(activeMinutes('25 min de cuisson')).toBeNull()
    expect(activeMinutes('30 min de repos + 10 min de cuisson')).toBeNull()
    expect(activeMinutes('15 à 20 min de mijotage')).toBeNull()
    expect(activeMinutes('20 min en air fryer')).toBeNull()
    expect(activeMinutes('beaucoup de temps')).toBeNull()
  })

  it('lit les heures et les fourchettes', () => {
    expect(activeMinutes('1 h 30')).toBe(90)
    expect(activeMinutes('2 h')).toBe(120)
    expect(activeMinutes('10 à 20 min')).toBe(15)
    expect(activeMinutes('45 min + 1 h de cuisson')).toBe(45)
  })

  it('arrondit à 5 min près, 5 min au minimum', () => {
    expect(activeMinutes('12 min')).toBe(10)
    expect(activeMinutes('2 min')).toBe(5)
  })
})

describe('estimation par le nombre d\'ingrédients et d\'étapes', () => {
  it('5 min + 1,5 min par ingrédient + 2 min par étape, à 5 min près', () => {
    expect(estimateFromCounts(8, 5)).toBe(25)
    expect(estimateFromCounts(3, 2)).toBe(15)
    expect(estimateFromCounts(20, 10)).toBe(55)
  })

  it('reste entre 5 et 90 min, et ne devine rien sans rien', () => {
    expect(estimateFromCounts(1, 0)).toBe(5)
    expect(estimateFromCounts(60, 30)).toBe(90)
    expect(estimateFromCounts(0, 0)).toBeNull()
  })
})

const recipe = (ingredients: string[], steps: string[], notes = '') => JSON.stringify([
  { type: 'heading', props: { level: 2 }, content: 'Ingrédients' },
  { type: 'paragraph', content: [{ type: 'text', text: 'Marinade', styles: { bold: true } }] },
  ...ingredients.map((t) => ({ type: 'checkListItem', content: t })),
  { type: 'heading', props: { level: 2 }, content: 'Étapes' },
  ...steps.map((t) => ({ type: 'numberedListItem', content: t })),
  { type: 'heading', props: { level: 2 }, content: 'Notes' },
  { type: 'paragraph', content: notes },
])

describe('lecture d\'une recette', () => {
  it('compte ingrédients et étapes, sans compter les sous-titres ni les lignes vides', () => {
    const r = readRecipe(JSON.parse(recipe(['1 oignon', '', '2 tomates'], ['Couper', 'Cuire'], 'Temps : 15 min. Recette de @x.')))
    expect(r).toEqual({ ingredients: 2, steps: 2, time: '15 min' })
  })
})

describe('estimation d\'une recette', () => {
  it('préfère le temps des notes', () => {
    expect(estimatePrep(recipe(['a', 'b'], ['x'], 'Temps : 15 min + 35 min de cuisson. Recette de @julya66.'))).toEqual({ minutes: 15, source: 'notes' })
  })

  it('sinon estime d\'après le contenu', () => {
    const r = estimatePrep(recipe(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], ['1', '2', '3', '4', '5'], 'Temps : 25 min de cuisson.'))
    expect(r).toEqual({ minutes: 25, source: 'estimation' })
  })

  it('renvoie null pour une page vide', () => {
    expect(estimatePrep(null)).toBeNull()
    expect(estimatePrep(JSON.stringify([{ type: 'paragraph', content: 'Une note' }]))).toBeNull()
  })
})

describe('recettes sans temps', () => {
  it('ne touche jamais un temps déjà rempli', () => {
    const base = recipe(['a', 'b'], ['x'])
    const { items, unknown } = missingTimes([
      { id: '1', title: 'Rempli', content: base, prep: 20 },
      { id: '2', title: 'Vide', content: base, prep: undefined },
      { id: '3', title: 'Zéro', content: base, prep: 0 },
      { id: '4', title: 'Texte vide', content: base, prep: '' },
      { id: '5', title: 'Rien à estimer', content: null, prep: undefined },
    ])
    expect(items.map((i) => i.id)).toEqual(['2', '3', '4'])
    expect(unknown).toBe(1)
  })
})
