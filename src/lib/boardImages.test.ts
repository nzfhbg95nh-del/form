import { describe, expect, it } from 'vitest'
import { extensionOf, imagesFolderName, planImageExport } from './boardImages'
import type { BoardItem } from './moodboard'

const img = (id: string, assetId: string, x: number, y: number): BoardItem => ({ id, kind: 'image', assetId, x, y, w: 100, h: 100 })
const asset = (id: string, mime = 'image/webp') => ({ id, data_url: `data:${mime};base64,AAAA` })

describe('export des images d’un moodboard', () => {
  it('lit l’extension dans l’adresse data:', () => {
    expect(extensionOf('data:image/png;base64,xx')).toBe('png')
    expect(extensionOf('data:image/jpeg;base64,xx')).toBe('jpg')
    expect(extensionOf('data:image/webp;base64,xx')).toBe('webp')
    expect(extensionOf('n’importe quoi')).toBe('jpg')
  })

  it('numérote les images de haut en bas puis de gauche à droite', () => {
    const items = [img('a', 'A', 300, 10), img('b', 'B', 0, 12), img('c', 'C', 0, 500)]
    const files = planImageExport(items, [asset('A'), asset('B', 'image/png'), asset('C')])
    expect(files.map((f) => [f.name, f.assetId])).toEqual([['001.png', 'B'], ['002.webp', 'A'], ['003.webp', 'C']])
  })

  it('n’exporte qu’une fois une image posée plusieurs fois, et ignore ce qui n’est pas une image', () => {
    const items: BoardItem[] = [img('a', 'A', 0, 0), img('b', 'A', 200, 0), { id: 'n', kind: 'note', x: 0, y: 0, w: 10, h: 10 }, img('x', 'MANQUANT', 0, 50)]
    const files = planImageExport(items, [asset('A')])
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('001.webp')
  })

  it('ne rend rien pour un moodboard sans image', () => {
    expect(planImageExport([], [asset('A')])).toEqual([])
  })

  it('nettoie le nom du dossier', () => {
    expect(imagesFolderName('Ma: déco / 2026?')).toBe('Ma déco 2026 - images')
    expect(imagesFolderName('   ')).toBe('Moodboard - images')
  })
})
