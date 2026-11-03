import { describe, expect, it } from 'vitest'
import { defaultChoices, deletionPlan, inCarousel, orderGroups, pickKeeper, wastedBytes, type DupeGroup, type DupeMember } from './dupes.ts'

const member = (rel: string, extra: Partial<DupeMember> = {}): DupeMember => ({
  rel, block: `b:${rel}`, kind: 'image', size: 1000, mtime: 100, width: 1000, height: 1000, thumb: null, source: 'instagram', owner: 'x', board: null, filesInBlock: 1, ...extra,
})
const group = (id: number, members: DupeMember[], kind: DupeGroup['kind'] = 'exact'): DupeGroup => ({ id, kind, members })

describe('pickKeeper', () => {
  it('garde la plus grande image', () => {
    expect(pickKeeper([member('petite', { width: 500, height: 500 }), member('grande', { width: 2000, height: 1500 })])).toBe('grande')
  })
  it('à taille égale, la plus lourde, puis la plus ancienne', () => {
    expect(pickKeeper([member('a', { size: 10 }), member('b', { size: 99 })])).toBe('b')
    expect(pickKeeper([member('a', { mtime: 50 }), member('b', { mtime: 10 })])).toBe('b')
  })
  it('sans dimensions (vidéo), la plus lourde gagne', () => {
    expect(pickKeeper([member('v1', { width: null, height: null, size: 5 }), member('v2', { width: null, height: null, size: 9 })])).toBe('v2')
  })
})

describe('choix de départ et suppression', () => {
  const g = group(0, [member('grande', { width: 2000, height: 2000 }), member('copie'), member('carrousel', { filesInBlock: 4 })])
  it('garde la meilleure image et propose de supprimer toutes les autres, carrousel compris', () => {
    const c = defaultChoices([g])
    expect(c.get('grande')).toBe('keep')
    expect(c.get('copie')).toBe('delete')
    expect(c.get('carrousel')).toBe('delete')
  })
  it('reconnaît une image prise dans un carrousel', () => {
    expect(inCarousel(member('x', { filesInBlock: 2 }))).toBe(true)
    expect(inCarousel(member('x'))).toBe(false)
  })
  it('une image seule part avec son bloc, une image de carrousel part seule', () => {
    expect(deletionPlan([g], defaultChoices([g]))).toEqual({ blocks: ['b:copie'], files: ['carrousel'] })
  })
  it('deux doublons dans des carrousels : l’un est gardé, l’autre peut être supprimé', () => {
    const two = group(1, [member('p1', { filesInBlock: 3 }), member('p2', { filesInBlock: 2 })])
    expect(deletionPlan([two], defaultChoices([two]))).toEqual({ blocks: [], files: ['p2'] })
  })
  it('ne supprime jamais tout un groupe', () => {
    const all = new Map<string, 'keep' | 'delete'>([['grande', 'delete'], ['copie', 'delete'], ['carrousel', 'delete']])
    expect(deletionPlan([g], all)).toEqual({ blocks: [], files: [] })
  })
  it('ce qui est gardé n’est jamais supprimé', () => {
    const c = new Map<string, 'keep' | 'delete'>([['grande', 'keep'], ['copie', 'keep'], ['carrousel', 'keep']])
    expect(deletionPlan([g], c)).toEqual({ blocks: [], files: [] })
  })
})
describe('classement des groupes', () => {
  it('place gagnée = tout sauf le plus gros fichier', () => {
    expect(wastedBytes(group(0, [member('a', { size: 300 }), member('b', { size: 100 }), member('c', { size: 50 })]))).toBe(150)
  })
  it('le groupe qui fait gagner le plus de place passe en premier', () => {
    const small = group(0, [member('a', { size: 10 }), member('b', { size: 10 })])
    const big = group(1, [member('c', { size: 9000 }), member('d', { size: 9000 })])
    expect(orderGroups([small, big]).map((g) => g.id)).toEqual([1, 0])
  })
})
