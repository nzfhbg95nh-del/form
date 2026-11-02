import { describe, expect, it } from 'vitest'
import { EMPTY_LINE_HINT, tabAction } from './editorKeys'

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
  it('l’aide d’une ligne vide parle des commandes « / », plus de l’IA', () => {
    expect(EMPTY_LINE_HINT).toBe('Tapez « / » pour afficher les commandes')
  })
})
