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

/** La phrase d'aide d'une ligne vide : elle dit qu'on peut écrire ici. */
export const EMPTY_LINE_HINT = 'Écris tes notes ici…'
