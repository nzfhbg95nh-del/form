import { describe, expect, it } from 'vitest'
import { summarize, type AddOutcome } from './ajoutsPure.ts'
import { buildBlocks } from './scan.ts'

const o = (status: AddOutcome['status'], error: string | null = null): AddOutcome => ({ name: 'x.jpg', status, rel: null, error })

describe('ajout d’images à la main', () => {
  it('résume ce qui a été ajouté, ce qui était déjà là et ce qui a échoué', () => {
    expect(summarize([o('added'), o('added'), o('duplicate')])).toBe('2 images ajoutées · 1 était déjà là')
    expect(summarize([o('added')])).toBe('1 image ajoutée')
    expect(summarize([o('duplicate'), o('duplicate')])).toBe('2 étaient déjà là')
    expect(summarize([o('error', 'Format non pris en charge.')])).toBe('1 non ajoutée (Format non pris en charge.)')
    expect(summarize([])).toBe('')
  })

  it('une image de « Mes ajouts » devient un bloc à elle, dans la collection « Mes ajouts »', () => {
    const mtime = Date.UTC(2026, 9, 26)
    const { blocks, collections } = buildBlocks([
      { rel: 'ajouts/3fa9c2.jpg', size: 10, mtime },
      { rel: 'ajouts/aa11bb.png', size: 20, mtime },
      { rel: 'pinterest/moi/Art/123.jpg', size: 30, mtime },
    ])
    const mine = blocks.filter((b) => b.source === 'manual')
    expect(mine.map((b) => b.id)).toEqual(['man:3fa9c2', 'man:aa11bb'])
    expect(mine[0].collectionIds).toEqual(['man:ajouts'])
    expect(mine[0].publishedAt).toBe('2026-10-26')
    expect(mine[0].files[0].rel).toBe('ajouts/3fa9c2.jpg')
    expect(collections.find((c) => c.id === 'man:ajouts')).toMatchObject({ name: 'Mes ajouts', kind: 'manual' })
    expect(blocks.some((b) => b.source === 'pinterest')).toBe(true)
  })
})
