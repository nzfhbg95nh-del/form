import { describe, expect, it } from 'vitest'
import { buildSession, keepInfo, ovenTemp, readSteps, stepsMinutes, suggestIdeas, type PrepRecipe } from './mealPrep'

const t = (text: string) => [{ type: 'text', text, styles: {} }]

describe('étapes et durées', () => {
  it('lit les étapes, et celles de la version sans viande à part', () => {
    const blocks = [
      { type: 'heading', props: { level: 2 }, content: t('Étapes') },
      { type: 'numberedListItem', content: t('Cuire 20 min.') },
      { type: 'heading', props: { level: 2 }, content: t('Version sans viande') },
      { type: 'heading', props: { level: 3 }, content: t('Ingrédients de cette version') },
      { type: 'checkListItem', content: t('200 g de tofu') },
      { type: 'heading', props: { level: 3 }, content: t('Ce qui change') },
      { type: 'numberedListItem', content: t('Dorer le tofu 5 min.') },
    ]
    expect(readSteps(blocks)).toEqual({ steps: ['Cuire 20 min.'], variantSteps: ['Dorer le tofu 5 min.'] })
  })
  it('additionne les durées des étapes', () => {
    expect(stepsMinutes(['Cuire 20 min.', 'Laisser mijoter 10 à 15 minutes.', 'Rôtir 1 h au four.'])).toBe(93)
  })
  it('trouve la température du four', () => {
    expect(ovenTemp(['Rôtir au four à 230 °C pendant 30 min.'])).toBe(230)
    expect(ovenTemp(['Cuire à la poêle 5 min.'])).toBeNull()
  })
})

describe('conservation', () => {
  it('un curry se garde 4 jours et se congèle', () => {
    const k = keepInfo('Chana masala', ['2 boîtes de pois chiches', '3 tomates'], ['Mijoter 15 min.'])
    expect(k).toMatchObject({ fridgeDays: 4, freezer: true, sameDay: false })
  })
  it('un plat pané se fait le jour même', () => {
    expect(keepInfo('Ramen katsu', ['100 g de panko'], ['Paner et frire.']).sameDay).toBe(true)
  })
  it('les crackers se gardent dans une boîte', () => {
    expect(keepInfo('Crackers aux graines', ['50 g de graines de lin'], []).pantry).toBe(true)
  })
  it('crème dans un plat à congeler : le conseil de l’ajouter au réchauffage', () => {
    expect(keepInfo('Palak paneer', ['2 c. à soupe de crème'], ['Mijoter 5 min']).tips.join(' ')).toMatch(/crème/)
  })
  it('avec du riz : 3 jours et le conseil de refroidir vite', () => {
    const k = keepInfo('Curry de légumes', ['250 g de riz'], [])
    expect(k.fridgeDays).toBe(3)
    expect(k.tips.join(' ')).toMatch(/refroidir vite/)
  })
})

const recipe = (over: Partial<PrepRecipe>): PrepRecipe => ({ id: 'x', title: 'X', lines: [], factor: 1, steps: [], variantSteps: [], prep: null, cook: null, meals: [], ...over })

describe('séance de cuisine', () => {
  const chana = recipe({ id: 'c', title: 'Chana masala', lines: ['2 oignons', '3 gousses d’ail', '2 cm de gingembre', '2 boîtes de pois chiches', '3 tomates', 'Coriandre fraîche'], steps: ['Mijoter 15 min.'], meals: [{ day: 0, meal: 'soir' }, { day: 5, meal: 'midi' }] })
  const dahl = recipe({ id: 'd', title: 'Dahl de lentilles corail', lines: ['1 oignon', '2 gousses d’ail', '200 g de lentilles corail', '250 g de riz'], steps: ['Cuire 20 min.'], meals: [{ day: 1, meal: 'midi' }] })
  const ajvar = recipe({ id: 'a', title: 'Ajvar', lines: ['1,5 kg de poivrons rouges', '1 aubergine'], steps: ['Rôtir au four à 230 °C pendant 35 min.', 'Cuire 40 min à feu doux.'], meals: [{ day: 2, meal: 'midi' }] })
  const s = buildSession([chana, dahl, ajvar])

  it('la mise en place commune additionne et met les ingrédients partagés en tête', () => {
    expect(s.miseEnPlace[0].text).toMatch(/oignons|ail/)
    expect(s.miseEnPlace.find((m) => m.text.includes('oignon'))?.text).toBe('Éplucher et émincer : 3 oignons')
    expect(s.miseEnPlace.find((m) => m.text.includes('ail'))?.recipes).toEqual(['Chana masala', 'Dahl de lentilles corail'])
  })
  it('les herbes fraîches sont préparées à part, en dernier', () => {
    expect(s.miseEnPlace[s.miseEnPlace.length - 1].text).toMatch(/Laver et ciseler/)
  })
  it('lance d’abord le four et le riz en lot', () => {
    expect(s.first.some((f) => f.text.startsWith('Préchauffer le four à 230 °C'))).toBe(true)
    expect(s.first.some((f) => f.text.startsWith('Cuire tout le riz') && f.text.includes('250 g'))).toBe(true)
  })
  it('le plat au four passe en premier', () => {
    expect(s.cooking[0].title).toBe('Ajvar')
  })
  it('frigo dans les jours qui suivent, congélateur au-delà', () => {
    const c = s.storage.find((x) => x.id === 'c')!
    expect(c.meals).toEqual([{ label: 'Lundi soir', where: 'frigo' }, { label: 'Samedi midi', where: 'congélateur' }])
  })
  it('les légumineuses sèches se mettent à tremper la veille', () => {
    const s2 = buildSession([recipe({ title: 'Houmous', lines: ['250 g de pois chiches secs'], meals: [] })])
    expect(s2.first[0].text).toMatch(/^La veille : faire tremper/)
  })
  it('donne une durée raisonnable', () => {
    expect(s.minutes).toBeGreaterThan(60)
    expect(s.minutes).toBeLessThan(240)
  })
})

describe('idées de meal prep', () => {
  const c = (id: string, title: string, lines: string[], steps: string[] = ['Mijoter 15 min.'], type: string | null = 'plats') => ({ id, title, lines, steps, type })
  const pool = [
    c('1', 'Chana masala', ['2 boîtes de pois chiches', '2 oignons', '3 tomates', '2 cm de gingembre']),
    c('2', 'Dahl de lentilles', ['200 g de lentilles corail', '1 oignon', '2 tomates', '2 cm de gingembre']),
    c('3', 'Palak paneer', ['250 g de paneer', '400 g d’épinards', '2 tomates', '1 oignon']),
    c('4', 'Curry de haricots rouges', ['1 boîte de haricots rouges', '1 oignon', '3 tomates']),
    c('5', 'Salade avocat', ['2 avocats', '1 salade verte', '1 citron'], [], 'midi'),
    c('6', 'Butter chicken', ['600 g de poulet', '1 oignon', '400 g de tomates']),
    c('7', 'Tiramisu', ['250 g de mascarpone', '3 œufs', 'café'], [], 'desserts'),
  ]
  const ideas = suggestIdeas(pool)
  it('propose des trios qui se gardent bien, sans viande ni dessert ni salade', () => {
    expect(ideas.length).toBeGreaterThan(0)
    const used = new Set(ideas.flatMap((i) => i.ids))
    expect(used.has('5')).toBe(false)
    expect(used.has('6')).toBe(false)
    expect(used.has('7')).toBe(false)
  })
  it('dit ce qui est en commun et pourquoi', () => {
    expect(ideas[0].shared).toEqual(expect.arrayContaining(['oignon', 'tomate']))
    expect(ideas[0].reasons.join(' ')).toMatch(/congèle/)
    expect(ideas[0].reasons.join(' ')).toMatch(/protéines variées/)
  })
  it('des idées différentes les unes des autres', () => {
    for (let i = 1; i < ideas.length; i++) expect(ideas[i].ids.filter((id) => ideas[0].ids.includes(id)).length).toBeLessThanOrEqual(1)
  })
})

describe('pièges de vocabulaire', () => {
  it('« c. à soupe » ne fait pas une soupe', () => {
    expect(keepInfo('Sandwich', ['2 c. à soupe de mayonnaise', '4 tranches de pain'], []).freezer).toBe(false)
  })
  it('le paneer n’est pas pané', () => {
    expect(keepInfo('Palak paneer', ['250 g de paneer'], ['Mijoter 5 min']).sameDay).toBe(false)
  })
  it('la pâte d’ail et gingembre n’est pas des pâtes', () => {
    expect(keepInfo('Chana masala', ['1 c. à soupe de pâte d’ail et gingembre'], []).tips.join(' ')).not.toMatch(/Pâtes/)
  })
})
