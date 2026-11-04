import { describe, expect, it } from 'vitest'
import { DEFAULT_TYPES } from './types.ts'
import { tagKey } from './text.ts'
import { SEMANTIC_TYPES } from './semantic.ts'

describe('types de départ de la bibliothèque', () => {
  it('« Céramique » et « IA » existent, avec leur dossier de « images ajoutées »', () => {
    expect(DEFAULT_TYPES.find((t) => t.name === 'Céramique')?.folders).toEqual(['Ceramique'])
    expect(DEFAULT_TYPES.find((t) => t.name === 'IA')?.folders).toEqual(['IA'])
  })
  it('chaque type décrit en mots correspond à un type de départ', () => {
    const ids = new Set(DEFAULT_TYPES.map((t) => tagKey(t.name)))
    for (const s of SEMANTIC_TYPES) expect(ids.has(s.typeId)).toBe(true)
  })
  it('un dossier ne donne son type qu’à un seul type, et les noms sont uniques', () => {
    const folders = DEFAULT_TYPES.flatMap((t) => t.folders ?? [])
    expect(new Set(folders).size).toBe(folders.length)
    expect(new Set(DEFAULT_TYPES.map((t) => tagKey(t.name))).size).toBe(DEFAULT_TYPES.length)
  })
  it('les dossiers de Victor déjà rangés par sujet donnent leur type (3d, Photo, Couture…)', () => {
    const byFolder = new Map(DEFAULT_TYPES.flatMap((t) => (t.folders ?? []).map((f) => [f, t.name] as const)))
    expect(byFolder.get('3d')).toBe('3D & CGI')
    expect(byFolder.get('Photo')).toBe('Photography & Clip')
    expect(byFolder.get('Couture & Sappes')).toBe('Fashion & sewing projects')
    expect(byFolder.has('A trier')).toBe(false)
  })
})
