import { describe, expect, it } from 'vitest'
import { splitCapture } from './capture'
import { extractText, normalize, searchObjects } from './search'
import type { ObjectRow } from './types'

const page = (id: string, title: string, content: unknown = null, over: Partial<ObjectRow> = {}): ObjectRow => ({
  id, type: 'page', parent_id: null, title, icon: null, cover: null, properties: '{}',
  content: content === null ? null : JSON.stringify(content), position: 0, is_favorite: 0,
  created_at: '', updated_at: '2026-01-01', deleted_at: null, ...over,
})

const objects = [
  page('1', 'Recette de la tarte aux pommes', [{ type: 'paragraph', content: [{ type: 'text', text: 'Mélanger le beurre et la farine' }] }]),
  page('2', 'Projet Dupont', [{ type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Logo et charte graphique' }] }]),
  page('3', 'Brouillon', [{ type: 'paragraph', content: 'Penser à la tarte de Maman' }], { updated_at: '2026-05-01' }),
  page('4', 'Supprimée tarte', null, { deleted_at: '2026-02-01' }),
  page('5', 'Sous-page', null, { parent_id: '2' }),
]

describe('recherche', () => {
  it('ignore accents et majuscules', () => {
    expect(normalize('Éléphant À Noël')).toBe('elephant a noel')
  })

  it('extrait le texte des blocs', () => {
    expect(extractText(JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'Bonjour' }, { type: 'link', href: 'x', content: [{ type: 'text', text: 'monde' }] }], children: [{ type: 'paragraph', content: 'enfant' }] }]))).toBe('Bonjour monde enfant')
    expect(extractText('pas du json')).toBe('')
    expect(extractText(null)).toBe('')
  })

  it('trouve par titre en premier, puis par contenu, sans les pages supprimées', () => {
    const hits = searchObjects(objects, 'tarte')
    expect(hits.map((h) => h.object.id)).toEqual(['1', '3'])
    expect(hits[0].snippet).toBeNull()
    expect(hits[1].snippet).toContain('tarte de Maman')
  })

  it('exige tous les mots, dans le titre ou le contenu', () => {
    expect(searchObjects(objects, 'dupont charte').map((h) => h.object.id)).toEqual(['2'])
    expect(searchObjects(objects, 'dupont pommes')).toHaveLength(0)
  })

  it('donne le chemin des sous-pages et les pages récentes sans recherche', () => {
    expect(searchObjects(objects, 'sous-page')[0].path).toEqual(['Projet Dupont'])
    expect(searchObjects(objects, '')[0].object.id).toBe('3')
    expect(searchObjects(objects, '').every((h) => h.object.id !== '4')).toBe(true)
  })
})

describe('capture rapide', () => {
  it('prend la première ligne comme titre, le reste comme contenu', () => {
    expect(splitCapture('Idée logo\nfond bleu\nforme ronde')).toEqual({
      title: 'Idée logo',
      blocks: [{ type: 'paragraph', content: 'fond bleu' }, { type: 'paragraph', content: 'forme ronde' }],
    })
    expect(splitCapture('\n  Seulement une ligne  ').blocks).toEqual([])
  })

  it('tronque un titre trop long sans perdre le texte', () => {
    const long = 'x'.repeat(100)
    const r = splitCapture(long)
    expect(r.title.length).toBeLessThanOrEqual(81)
    expect(r.blocks).toEqual([{ type: 'paragraph', content: long }])
  })
})
