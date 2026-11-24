import { describe, expect, it } from 'vitest'
import { groupByUrl, instagramParts, isBlocked, matchDownloaded, pinterestId, recoverUrl, type MissingFile } from './recover.ts'

const ig = (rel: string): MissingFile => ({ rel, blockId: 'b', source: 'instagram', originUrl: 'https://www.instagram.com/0ni.0ne/' })
const pin = (rel: string, originUrl: string | null = null): MissingFile => ({ rel, blockId: 'p', source: 'pinterest', originUrl })

describe('retrouver les fichiers introuvables', () => {
  it('lit le code du post Instagram, même avec des « _ » dedans', () => {
    expect(instagramParts('instagram/0ni.0ne/20260411_DW_gXlYDA6J_04.jpg')).toEqual({ code: 'DW_gXlYDA6J', num: '04' })
    expect(recoverUrl(ig('instagram/0ni.0ne/20260411_DW_gXlYDA6J_04.jpg'))).toBe('https://www.instagram.com/p/DW_gXlYDA6J/')
  })
  it('Pinterest : le lien de l’épingle, ou le numéro du fichier', () => {
    expect(recoverUrl(pin('pinterest/x/b/100697741658949760.jpg', 'https://www.pinterest.com/pin/100697741658949760/'))).toBe('https://www.pinterest.com/pin/100697741658949760/')
    expect(pinterestId('pinterest/x/b/100697741658949763.png')).toBe('100697741658949763')
    expect(recoverUrl(pin('pinterest/x/b/100697741658949763.png'))).toBe('https://www.pinterest.com/pin/100697741658949763/')
  })
  it('les images ajoutées à la main n’ont pas de source', () => {
    expect(recoverUrl({ rel: 'ajouts/3d/a.jpg', blockId: 'm', source: 'manual', originUrl: null })).toBeNull()
  })
  it('retrouve le bon fichier téléchargé, même si l’extension change', () => {
    const files = ['C:/tmp/1/DW_gXlYDA6J_01.jpg', 'C:/tmp/1/DW_gXlYDA6J_04.webp', 'C:/tmp/1/100697741658949763.jpg']
    expect(matchDownloaded(ig('instagram/0ni.0ne/20260411_DW_gXlYDA6J_04.jpg'), files)).toBe('C:/tmp/1/DW_gXlYDA6J_04.webp')
    expect(matchDownloaded(pin('pinterest/x/b/100697741658949763.png'), files)).toBe('C:/tmp/1/100697741658949763.jpg')
    expect(matchDownloaded(ig('instagram/0ni.0ne/20260411_ZZZ_05.jpg'), files)).toBeNull()
  })
  it('une image de carrousel, téléchargée seule, est numérotée 01', () => {
    expect(matchDownloaded(ig('instagram/0ni.0ne/20260411_DW_gXp2DPCi_05.jpg'), ['C:/tmp/2/DW_gXp2DPCi_01.jpg'])).toBe('C:/tmp/2/DW_gXp2DPCi_01.jpg')
  })
  it('un carrousel Instagram = un seul téléchargement', () => {
    const g = groupByUrl([ig('instagram/a/20260411_ABC_01.jpg'), ig('instagram/a/20260411_ABC_02.jpg'), pin('pinterest/x/b/123456789.jpg')])
    expect(g.map((x) => [x.url, x.files.length])).toEqual([['https://www.instagram.com/p/ABC/', 2], ['https://www.pinterest.com/pin/123456789/', 1]])
  })
  it('reconnaît un refus du site', () => {
    expect(isBlocked('Aucune image reçue. gallery-dl dit : [instagram][error] HttpError: \'401 Unauthorized\'')).toBe(true)
    expect(isBlocked('Aucune image reçue. gallery-dl dit : [pinterest][error] NotFoundError: Requested pin could not be found')).toBe(false)
  })
})
