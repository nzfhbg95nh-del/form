import { describe, expect, it } from 'vitest'
import { appendBlockToContent } from './blocks'

const para = (text = '') => ({ type: 'paragraph', content: text ? [{ type: 'text', text, styles: {} }] : [] })

describe('déplacer un bloc vers une autre page', () => {
  it('ajoute le bloc à la fin, sans son identifiant', () => {
    const out = JSON.parse(appendBlockToContent(JSON.stringify([{ id: 'a', ...para('un') }]), { id: 'b', ...para('deux') }))
    expect(out).toHaveLength(2)
    expect(out[1].id).toBeUndefined()
    expect(out[1].content[0].text).toBe('deux')
  })
  it('garde la ligne vide du bas tout en bas', () => {
    const out = JSON.parse(appendBlockToContent(JSON.stringify([para('un'), para()]), { id: 'b', ...para('deux') }))
    expect(out.map((b: { content: { text?: string }[] }) => b.content[0]?.text ?? '')).toEqual(['un', 'deux', ''])
  })
  it('une page vide ou sans contenu reçoit le bloc', () => {
    expect(JSON.parse(appendBlockToContent(null, para('x')))).toHaveLength(1)
    expect(JSON.parse(appendBlockToContent('', para('x')))).toHaveLength(1)
  })
  it('un contenu abîmé ne fait rien planter', () => {
    expect(JSON.parse(appendBlockToContent('{pas du json', para('x')))).toHaveLength(1)
  })
  it('emporte les sous-blocs, eux aussi sans identifiant', () => {
    const out = JSON.parse(appendBlockToContent(null, { id: 'p', type: 'bulletListItem', content: [], children: [{ id: 'c', ...para('enfant') }] }))
    expect(out[0].children[0].id).toBeUndefined()
    expect(out[0].children[0].content[0].text).toBe('enfant')
  })
})