import { describe, expect, it } from 'vitest'
import { backlinksTo, excerptOf, pageHeadings } from './pageLinks'
import type { ObjectRow } from './types'

const row = (over: Partial<ObjectRow>): ObjectRow => ({
  id: 'x', type: 'page', parent_id: null, title: 'P', icon: null, cover: null, properties: '{}', content: null, position: 0, is_favorite: 0,
  created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null, ...over,
})
const para = (text: string) => ({ id: 'p' + text, type: 'paragraph', content: [{ type: 'text', text }] })
const head = (id: string, level: number, text: string) => ({ id, type: 'heading', props: { level }, content: [{ type: 'text', text }] })

describe('liens et plan d’une page', () => {
  it('relève les titres, y compris dans les sous-blocs, et ignore les titres vides', () => {
    const content = JSON.stringify([head('a', 1, 'Intro'), { id: 'b', type: 'toggleListItem', content: [], children: [head('c', 2, 'Détail')] }, head('d', 1, '  ')])
    expect(pageHeadings(content)).toEqual([{ id: 'a', level: 1, text: 'Intro' }, { id: 'c', level: 2, text: 'Détail' }])
    expect(pageHeadings(null)).toEqual([])
  })

  it('trouve les pages qui citent une page (mention ou bloc page), les plus récentes d’abord', () => {
    const mention = JSON.stringify([{ id: '1', type: 'paragraph', content: [{ type: 'mention', props: { pageId: 'cible' } }] }])
    const objects = [
      row({ id: 'cible' }),
      row({ id: 'a', content: mention, updated_at: '2026-02-01' }),
      row({ id: 'b', content: mention, updated_at: '2026-03-01' }),
      row({ id: 'c', content: mention, deleted_at: '2026-03-02' }),
      row({ id: 'd', content: JSON.stringify([para('rien')]) }),
      row({ id: 'e', type: 'database', content: mention }),
    ]
    expect(backlinksTo(objects, 'cible').map((o) => o.id)).toEqual(['b', 'a'])
  })

  it('résume le début d’une page', () => {
    const content = JSON.stringify([para('Premier paragraphe.'), para('Deuxième.')])
    expect(excerptOf(content)).toBe('Premier paragraphe. · Deuxième.')
    expect(excerptOf(JSON.stringify([para('a'.repeat(300))]), 20)).toBe('a'.repeat(20) + '…')
    expect(excerptOf(null)).toBe('')
  })
})
