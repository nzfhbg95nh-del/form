// Les actions applicables à un ou plusieurs blocs, comme dans Notion : le menu Ctrl+/ (avec recherche) et les commandes « / » qui agissent
// sur le bloc (/rouge, /fond bleu, /dupliquer, /supprimer, /déplacer). Logique pure, testée automatiquement.

import { COLOR_IDS, colorLabel, KINDS, type ColorId, type ColorKind } from './blockKinds'

export type BlockActionRun =
  | { kind: 'turn'; id: string }
  | { kind: 'color'; colorKind: ColorKind; color: ColorId }
  | { kind: 'duplicate' }
  | { kind: 'delete' }
  | { kind: 'move' }
  | { kind: 'link' }

export interface BlockAction {
  key: string
  label: string
  group: 'Transformer en' | 'Couleur' | 'Actions'
  /** Autres mots qui trouvent l'action (français et anglais, comme les commandes de Notion). */
  aliases: string[]
  shortcut?: string
  run: BlockActionRun
}

const COLOR_WORDS: Record<ColorId, string[]> = {
  default: ['défaut', 'defaut', 'default', 'aucune'],
  gray: ['gris', 'gray', 'grey'],
  brown: ['marron', 'brun', 'brown'],
  orange: ['orange'],
  yellow: ['jaune', 'yellow'],
  green: ['vert', 'green'],
  blue: ['bleu', 'blue'],
  purple: ['violet', 'purple', 'mauve'],
  pink: ['rose', 'pink'],
  red: ['rouge', 'red'],
}

export function colorActions(kinds: ColorKind[] = ['text', 'background']): BlockAction[] {
  const out: BlockAction[] = []
  for (const colorKind of kinds) {
    for (const color of COLOR_IDS) {
      const words = COLOR_WORDS[color]
      const aliases = colorKind === 'text'
        ? ['couleur', 'color', 'texte', ...words, ...words.map((w) => `texte ${w}`)]
        : ['couleur', 'color', 'fond', 'surligner', 'background', ...words.map((w) => `fond ${w}`), ...words.map((w) => `${w} background`)]
      out.push({ key: `${colorKind}-${color}`, label: colorLabel(colorKind, color), group: 'Couleur', aliases, run: { kind: 'color', colorKind, color } })
    }
  }
  return out
}

export const DUPLICATE: BlockAction = { key: 'duplicate', label: 'Dupliquer', group: 'Actions', aliases: ['dupliquer', 'duplicate', 'copier', 'copie'], shortcut: 'Ctrl+D', run: { kind: 'duplicate' } }
export const MOVE: BlockAction = { key: 'move', label: 'Déplacer vers une page…', group: 'Actions', aliases: ['déplacer', 'deplacer', 'moveto', 'move', 'envoyer'], run: { kind: 'move' } }
export const DELETE: BlockAction = { key: 'delete', label: 'Supprimer', group: 'Actions', aliases: ['supprimer', 'effacer', 'delete', 'retirer'], shortcut: 'Suppr', run: { kind: 'delete' } }
export const COPY_LINK: BlockAction = { key: 'link', label: 'Copier le lien du bloc', group: 'Actions', aliases: ['lien', 'link', 'copier le lien'], shortcut: 'Alt+⇧+L', run: { kind: 'link' } }

/**
 * Le menu Ctrl+/ pour les blocs choisis. `withText` : au moins un bloc a du texte (on peut le transformer) ;
 * `textColor` / `backgroundColor` : ces couleurs sont possibles ; `single` : un seul bloc (le lien du bloc n'a de sens que pour un).
 */
export function blockActions(o: { withText: boolean; textColor: boolean; backgroundColor: boolean; single: boolean }): BlockAction[] {
  const kinds: ColorKind[] = [...(o.textColor ? ['text' as const] : []), ...(o.backgroundColor ? ['background' as const] : [])]
  return [
    ...(o.withText ? KINDS.map((k): BlockAction => ({ key: `turn-${k.id}`, label: k.label, group: 'Transformer en', aliases: ['transformer', 'turn', k.id], run: { kind: 'turn', id: k.id } })) : []),
    ...colorActions(kinds),
    DUPLICATE,
    MOVE,
    ...(o.single ? [COPY_LINK] : []),
    DELETE,
  ]
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Filtre comme Notion : chaque mot tapé doit être le début d'un mot du nom de l'action, de son groupe ou d'un de ses autres noms
 * (« rouge » trouve « Texte rouge » et « Fond rouge » ; « fond rou » ne trouve que le fond). Sans recherche : tout.
 */
export function filterBlockActions(list: BlockAction[], query: string): BlockAction[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return list
  return list.filter((a) => {
    const tokens = fold([a.label, a.group, ...a.aliases].join(' ')).split(/[\s'’…]+/).filter(Boolean)
    return words.every((w) => tokens.some((t) => t.startsWith(w)))
  })
}
