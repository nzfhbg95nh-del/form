import { describe, expect, it } from 'vitest'
import { boardFileName, buildBoardFile, importedTitle, parseBoardFile } from './boardFile'
import { emptyBoard, makeVideo, serializeBoard } from './moodboard'
import type { BoardAsset } from './types'

const asset = (id: string): BoardAsset => ({ board_id: 'b1', id, name: `${id}.png`, width: 100, height: 50, data_url: `data:image/png;base64,${id}`, thumb_url: `data:image/png;base64,t${id}`, created_at: '2026-01-01T00:00:00.000Z' })
const board = { ...emptyBoard(), bg: '#ffffff', items: [{ id: 'i1', kind: 'image' as const, x: 1, y: 2, w: 3, h: 4, assetId: 'a1' }, { id: 'i2', kind: 'note' as const, x: 5, y: 6, w: 7, h: 8, text: 'Salut' }] }
const source = { title: 'Mon mood', icon: '🖼️', content: serializeBoard(board), coverAsset: 'a1', assets: [asset('a1'), asset('a2')] }

describe('fichier de moodboard', () => {
  it('ce qu’on exporte se réimporte à l’identique (plan, titre, icône, couverture, images)', () => {
    const parsed = parseBoardFile(buildBoardFile(source))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.title).toBe('Mon mood')
    expect(parsed.file.icon).toBe('🖼️')
    expect(parsed.file.coverAsset).toBe('a1')
    expect(parsed.file.board.items).toEqual(board.items)
    expect(parsed.file.board.bg).toBe('#ffffff')
    expect(parsed.file.assets.map((a) => a.id)).toEqual(['a1', 'a2'])
    expect(parsed.file.assets[0].data_url).toBe('data:image/png;base64,a1')
    expect(parsed.file.assets[0].thumb_url).toBe('data:image/png;base64,ta1')
  })
  it('le fichier ne garde pas l’identifiant de l’ancien moodboard', () => {
    expect(buildBoardFile(source)).not.toContain('board_id')
  })
  it('les vidéos gardent leur chemin ou leur lien dans le fichier (sans être copiées)', () => {
    const withVideos = { ...board, items: [...board.items, makeVideo({ x: 0, y: 0 }, 'C:\\Videos\\rendu.mp4', 'rendu'), makeVideo({ x: 10, y: 10 }, 'https://youtu.be/YpoNPAX8yGA', 'YouTube')] }
    const text = buildBoardFile({ ...source, content: serializeBoard(withVideos) })
    expect(text.length).toBeLessThan(2000 + source.assets.length * 200)
    const parsed = parseBoardFile(text)
    expect(parsed.ok && parsed.file.board.items.filter((i) => i.kind === 'video').map((i) => i.url)).toEqual(['C:\\Videos\\rendu.mp4', 'https://youtu.be/YpoNPAX8yGA'])
  })
  it('un moodboard vide s’exporte aussi', () => {
    const parsed = parseBoardFile(buildBoardFile({ title: '', icon: null, content: null, coverAsset: null, assets: [] }))
    expect(parsed.ok && parsed.file.title).toBe('Moodboard')
    expect(parsed.ok && parsed.file.board.items).toEqual([])
  })
  it('refuse un texte qui n’est pas du JSON', () => {
    const r = parseBoardFile('pas du json')
    expect(r.ok).toBe(false)
  })
  it('refuse un autre fichier JSON', () => {
    const r = parseBoardFile(JSON.stringify({ hello: 'world' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('pas un moodboard Form')
  })
  it('refuse un fichier d’une version plus récente', () => {
    const r = parseBoardFile(JSON.stringify({ ...JSON.parse(buildBoardFile(source)), version: 99 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('plus récente')
  })
  it('refuse un plan ou une image abîmés', () => {
    const base = JSON.parse(buildBoardFile(source))
    expect(parseBoardFile(JSON.stringify({ ...base, board: { items: 3 } })).ok).toBe(false)
    expect(parseBoardFile(JSON.stringify({ ...base, assets: [{ id: 'x' }] })).ok).toBe(false)
    expect(parseBoardFile(JSON.stringify({ ...base, assets: 'non' })).ok).toBe(false)
  })
  it('oublie une couverture qui n’est pas dans le fichier', () => {
    const base = JSON.parse(buildBoardFile(source))
    const r = parseBoardFile(JSON.stringify({ ...base, coverAsset: 'inconnue' }))
    expect(r.ok && r.file.coverAsset).toBeNull()
  })
  it('une miniature absente est remplacée par l’image', () => {
    const base = JSON.parse(buildBoardFile(source))
    base.assets[0].thumb_url = ''
    const r = parseBoardFile(JSON.stringify(base))
    expect(r.ok && r.file.assets[0].thumb_url).toBe('data:image/png;base64,a1')
  })
})

describe('titre d’un moodboard importé', () => {
  it('garde le titre s’il est libre', () => {
    expect(importedTitle('Voyage', ['Autre'])).toBe('Voyage')
  })
  it('ajoute « (importé) » s’il existe déjà, sans tenir compte des majuscules', () => {
    expect(importedTitle('Voyage', ['voyage'])).toBe('Voyage (importé)')
  })
  it('numérote quand il y en a déjà un importé', () => {
    expect(importedTitle('Voyage', ['Voyage', 'Voyage (importé)'])).toBe('Voyage (importé 2)')
    expect(importedTitle('Voyage', ['Voyage', 'Voyage (importé)', 'Voyage (importé 2)'])).toBe('Voyage (importé 3)')
  })
})

describe('nom du fichier', () => {
  it('retire les caractères interdits par Windows', () => {
    expect(boardFileName('Rendu: "A/B"?')).toBe('Rendu A B.formboard')
  })
  it('un titre vide donne « Moodboard »', () => {
    expect(boardFileName('  ')).toBe('Moodboard.formboard')
  })
})
