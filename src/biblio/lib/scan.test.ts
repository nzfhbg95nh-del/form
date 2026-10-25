import { describe, expect, it } from 'vitest'
import { buildBlocks, diffFiles, dropForgotten, type BlockDraft, type ScannedFile } from './scan.ts'

const f = (rel: string): ScannedFile => ({ rel, size: 10, mtime: 1 })

describe('buildBlocks — Instagram', () => {
  it('regroupe un carrousel (même auteur, même date) dans l\'ordre du numéro', () => {
    const { blocks } = buildBlocks([
      f('instagram/093lab/20260921_DdjbIEhIPs4_02.jpg'),
      f('instagram/093lab/20260921_DdjbICzoxZg_01.jpg'),
      f('instagram/093lab/20260921_DdjbIJPyXJL_03.mp4'),
    ])
    expect(blocks).toHaveLength(1)
    const b = blocks[0]
    expect(b.id).toBe('ig:093lab:20260921')
    expect(b.kind).toBe('carousel')
    expect(b.publishedAt).toBe('2026-09-21')
    expect(b.files.map((x) => x.position)).toEqual([0, 1, 2])
    expect(b.files[0].rel).toContain('_01.')
    expect(b.files[2].kind).toBe('video')
  })

  it('une image seule donne un bloc image, une vidéo seule un bloc vidéo', () => {
    const { blocks } = buildBlocks([f('instagram/a/20250718_DMQVZW8iwDw_01.mp4'), f('instagram/b/20240101_AAAAAAAAAAA_01.jpg')])
    expect(blocks.find((b) => b.owner === 'a')?.kind).toBe('video')
    expect(blocks.find((b) => b.owner === 'b')?.kind).toBe('image')
  })

  it('accepte les codes avec « - » et « _ »', () => {
    const { blocks } = buildBlocks([f('instagram/x/20231109_CzbPtL2CyB-_02.jpg'), f('instagram/x/20231109_DW_gXdIjJQL_01.jpg')])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].files).toHaveLength(2)
  })

  it('deux posts le même jour (le numéro repart de 1) donnent deux blocs', () => {
    const { blocks } = buildBlocks([
      f('instagram/x/20260101_AAAAAAAAAAA_01.jpg'),
      f('instagram/x/20260101_BBBBBBBBBBB_02.jpg'),
      f('instagram/x/20260101_CCCCCCCCCCC_01.jpg'),
    ])
    // numéros triés : 01, 01, 02 → [01,02] puis [01]
    expect(blocks).toHaveLength(2)
    expect(blocks.map((b) => b.id).sort()).toEqual(['ig:x:20260101', 'ig:x:20260101:2'])
  })

  it('crée une collection automatique par compte', () => {
    const { collections, blocks } = buildBlocks([f('instagram/0ni.0ne/20260411_DW_gXYljMgt_01.jpg')])
    expect(collections).toEqual([{ id: 'ig:0ni.0ne', name: '0ni.0ne', kind: 'instagram', owner: '0ni.0ne' }])
    expect(blocks[0].collectionIds).toEqual(['ig:0ni.0ne'])
  })

  it('ignore les chemins inconnus', () => {
    expect(buildBlocks([f('autre/chose.jpg'), f('instagram/x/photo.jpg')]).blocks).toHaveLength(0)
  })
})

describe('buildBlocks — Pinterest', () => {
  it('un pin = un bloc, avec le lien d\'origine et le tableau en collection', () => {
    const { blocks, collections } = buildBlocks([f('pinterest/DYSARTADD/3D & CGI/646336984025094866.jpg')])
    expect(blocks[0].id).toBe('pin:646336984025094866')
    expect(blocks[0].originUrl).toBe('https://www.pinterest.com/pin/646336984025094866/')
    expect(blocks[0].board).toBe('3D & CGI')
    expect(collections[0]).toEqual({ id: 'pin:DYSARTADD/3D & CGI', name: '3D & CGI', kind: 'pinterest', owner: 'DYSARTADD' })
  })

  it('le même pin dans deux tableaux donne deux blocs distincts', () => {
    const { blocks } = buildBlocks([f('pinterest/a/Tab1/111.jpg'), f('pinterest/b/Tab2/111.jpg')])
    expect(blocks).toHaveLength(2)
    expect(new Set(blocks.map((b) => b.id)).size).toBe(2)
  })
})

describe('diffFiles', () => {
  const scanned = [f('a.jpg'), f('b.jpg'), f('c.jpg')]
  it('détecte les nouveaux fichiers, sans doublon', () => {
    const d = diffFiles(scanned, [{ rel: 'a.jpg', missing: 0 }, { rel: 'b.jpg', missing: 0 }])
    expect(d.added.map((x) => x.rel)).toEqual(['c.jpg'])
    expect(d.missing).toEqual([])
  })
  it('marque introuvable un fichier disparu, sans le supprimer', () => {
    const d = diffFiles([f('a.jpg')], [{ rel: 'a.jpg', missing: 0 }, { rel: 'b.jpg', missing: 0 }])
    expect(d.missing).toEqual(['b.jpg'])
  })
  it('ne re-signale pas un fichier déjà introuvable, et signale son retour', () => {
    const d1 = diffFiles([], [{ rel: 'b.jpg', missing: 1 }])
    expect(d1.missing).toEqual([])
    const d2 = diffFiles([f('b.jpg')], [{ rel: 'b.jpg', missing: 1 }])
    expect(d2.restored).toEqual(['b.jpg'])
    expect(d2.added).toEqual([])
  })
  it('un second scan identique ne change rien', () => {
    const d = diffFiles(scanned, scanned.map((s) => ({ rel: s.rel, missing: 0 })))
    expect(d).toEqual({ added: [], missing: [], restored: [] })
  })
})

describe('dropForgotten', () => {
  const mk = (id: string): BlockDraft => ({ id, source: 'pinterest', owner: 'o', board: 'b', originId: id, originUrl: '', kind: 'image', publishedAt: null, collectionIds: [], files: [] })
  it('retire les blocs supprimés définitivement et garde les autres', () => {
    const blocks = [mk('pin:1'), mk('pin:2'), mk('pin:3')]
    expect(dropForgotten(blocks, new Set(['pin:2'])).map((b) => b.id)).toEqual(['pin:1', 'pin:3'])
  })
  it('rien à retirer : la même liste', () => {
    const blocks = [mk('pin:1')]
    expect(dropForgotten(blocks, new Set())).toBe(blocks)
  })
})
