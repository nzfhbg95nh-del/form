import { describe, expect, it } from 'vitest'
import { carouselTrashPlan, sortTrash, splitTrashSelection } from './trashPlan.ts'
import { dropRemovedFiles } from './scan.ts'

describe('corbeille : ordre', () => {
  it('montre d\'abord ce qui a été supprimé en dernier', () => {
    const items = [
      { key: 'a', trashedAt: '2026-11-01T10:00:00Z' },
      { key: 'b', trashedAt: '2026-11-20T10:00:00Z' },
      { key: 'c', trashedAt: '2026-11-10T10:00:00Z' },
    ]
    expect(sortTrash(items).map((i) => i.key)).toEqual(['b', 'c', 'a'])
  })
  it('garde toujours le même ordre à date égale, sans toucher à la liste reçue', () => {
    const items = [{ key: 'z', trashedAt: 't' }, { key: 'a', trashedAt: 't' }]
    expect(sortTrash(items).map((i) => i.key)).toEqual(['a', 'z'])
    expect(items[0].key).toBe('z')
  })
})

describe('corbeille : une image d\'un carrousel', () => {
  const carousel = ['ig/a_01.jpg', 'ig/a_02.jpg', 'ig/a_03.jpg']
  it('ne retire que l\'image choisie', () => {
    expect(carouselTrashPlan(carousel, ['ig/a_02.jpg'])).toEqual({ whole: false, rels: ['ig/a_02.jpg'] })
  })
  it('garde l\'ordre du carrousel quand on en retire plusieurs', () => {
    expect(carouselTrashPlan(carousel, ['ig/a_03.jpg', 'ig/a_01.jpg'])).toEqual({ whole: false, rels: ['ig/a_01.jpg', 'ig/a_03.jpg'] })
  })
  it('met tout le carrousel à la corbeille s\'il ne resterait plus rien', () => {
    expect(carouselTrashPlan(carousel, [...carousel])).toEqual({ whole: true })
    expect(carouselTrashPlan(['seule.jpg'], ['seule.jpg'])).toEqual({ whole: true })
  })
  it('ignore une image qui n\'est pas dans ce carrousel', () => {
    expect(carouselTrashPlan(carousel, ['autre.jpg'])).toEqual({ whole: false, rels: [] })
  })
})

describe('corbeille : sélection', () => {
  it('sépare images entières et images seules de carrousels', () => {
    const items = [
      { key: 'bloc1', type: 'block' as const },
      { key: 'ig/a_02.jpg', type: 'file' as const },
      { key: 'bloc2', type: 'block' as const },
    ]
    expect(splitTrashSelection(items, new Set(['bloc1', 'ig/a_02.jpg']))).toEqual({ blockIds: ['bloc1'], rels: ['ig/a_02.jpg'] })
  })
})

describe('mise à jour de la bibliothèque', () => {
  it('ne réimporte pas une image de carrousel mise à la corbeille ou supprimée', () => {
    const added = [{ rel: 'ig/a_01.jpg', size: 1, mtime: 1 }, { rel: 'ig/a_02.jpg', size: 1, mtime: 1 }]
    expect(dropRemovedFiles(added, new Set(['ig/a_02.jpg'])).map((f) => f.rel)).toEqual(['ig/a_01.jpg'])
    expect(dropRemovedFiles(added, new Set())).toHaveLength(2)
  })
})
