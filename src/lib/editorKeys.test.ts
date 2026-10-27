import { describe, expect, it } from 'vitest'
import { spaceOpensAssistant, tabAction } from './editorKeys'

const none = { ctrl: false, alt: false, shift: false, meta: false }

describe('touches de l’éditeur comme dans Notion', () => {
  it('Tab sur une ligne de texte passe au bloc suivant, Maj+Tab au précédent', () => {
    expect(tabAction('paragraph', false)).toBe('next')
    expect(tabAction('heading', false)).toBe('next')
    expect(tabAction('paragraph', true)).toBe('prev')
  })
  it('Tab garde son rôle dans les listes, les tâches, les tableaux et le code', () => {
    for (const t of ['bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem', 'todo', 'table', 'codeBlock']) {
      expect(tabAction(t, false)).toBe('default')
      expect(tabAction(t, true)).toBe('default')
    }
  })
  it('Espace sur une ligne vide ouvre l’assistant, pas ailleurs', () => {
    expect(spaceOpensAssistant('paragraph', true, ' ', none)).toBe(true)
    expect(spaceOpensAssistant('paragraph', false, ' ', none)).toBe(false)
    expect(spaceOpensAssistant('heading', true, ' ', none)).toBe(false)
    expect(spaceOpensAssistant('paragraph', true, 'a', none)).toBe(false)
    expect(spaceOpensAssistant('paragraph', true, ' ', { ...none, ctrl: true })).toBe(false)
  })
})
