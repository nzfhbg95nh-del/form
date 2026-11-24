import { describe, expect, it } from 'vitest'
import { todayIdeas } from './kitchenIdeas'

const r = (id: string, lines: string[], type: string | null = 'plats') => ({ id, title: id, lines, steps: [], type })
const all = [
  r('soupe-courge', ['1 butternut', '1 oignon', '50 cl de bouillon']),
  r('dahl', ['200 g de lentilles corail', '1 oignon', '400 ml de lait de coco']),
  r('dahl2', ['250 g de lentilles vertes', '1 carotte', '1 oignon']),
  r('rata', ['2 aubergines', '2 courgettes', '3 tomates']),
  r('poulet', ['500 g de poulet', '1 oignon', '1 citron']),
  r('gateau', ['200 g de farine', '3 œufs', '100 g de sucre'], 'desserts'),
]

describe('idées pour aujourd’hui', () => {
  const nov = new Date(2026, 10, 24)
  it('sans viande, pas de dessert, rien d’une autre saison, une idée par protéine', () => {
    const ids = todayIdeas(all, nov).map((i) => i.id)
    expect(ids).not.toContain('poulet')
    expect(ids).not.toContain('gateau')
    expect(ids).not.toContain('rata')
    expect(ids.filter((id) => id.startsWith('dahl'))).toHaveLength(1)
  })
  it('les plats de saison passent devant et disent pourquoi', () => {
    const first = todayIdeas(all, nov)[0]
    expect(first.id).toBe('soupe-courge')
    expect(first.reasons[0]).toMatch(/de saison : courge/)
  })
  it('ne repropose pas ce qui est déjà prévu cette semaine', () => {
    expect(todayIdeas(all, nov, new Set(['soupe-courge'])).map((i) => i.id)).not.toContain('soupe-courge')
  })
  it('les mêmes idées toute la journée', () => {
    expect(todayIdeas(all, new Date(2026, 10, 24, 8))).toEqual(todayIdeas(all, new Date(2026, 10, 24, 20)))
  })
})

describe('idées pour aujourd’hui : variantes', () => {
  it('pas deux variantes du même plat', () => {
    const list = [r('Nouilles de pomme de terre épicées', ['500 g de pommes de terre', '1 oignon', '1 piment']), r('Nouilles de pomme de terre maison', ['500 g de pommes de terre', '100 g de fécule', 'sel'])]
    expect(todayIdeas(list, new Date(2026, 10, 24))).toHaveLength(1)
  })
})
