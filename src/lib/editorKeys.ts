// Touches de l'éditeur de pages « comme dans Notion » (logique pure, testée automatiquement).

/** Blocs où Tab garde son rôle propre (décaler en sous-élément, passer à la cellule suivante, indenter le code). */
const TAB_OWN = new Set(['bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem', 'todo', 'table', 'codeBlock'])

export type TabAction = 'default' | 'next' | 'prev'

/**
 * Tab sur une ligne de texte (paragraphe, titre, citation…) : le curseur passe au bloc suivant (Maj+Tab : au précédent),
 * sans rien décaler. Dans une liste, une tâche, un tableau ou du code, Tab fait ce qu'il faisait.
 */
export function tabAction(blockType: string, shift: boolean): TabAction {
  if (TAB_OWN.has(blockType)) return 'default'
  return shift ? 'prev' : 'next'
}

/** Les touches Espace / texte : sur une ligne vide, Espace ouvre l'assistant (« Appuyez sur la touche Espace pour l'IA »). */
export function spaceOpensAssistant(blockType: string, isEmpty: boolean, key: string, mods: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }): boolean {
  return key === ' ' && blockType === 'paragraph' && isEmpty && !mods.ctrl && !mods.alt && !mods.shift && !mods.meta
}

/** La phrase d'aide d'une ligne vide, celle de Notion. */
export const EMPTY_LINE_HINT = 'Appuyez sur la touche « Espace » pour l’IA, ou sur « / » pour afficher les commandes'
