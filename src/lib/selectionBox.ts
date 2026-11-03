// Le rectangle de sélection d'un bloc, comme dans Notion : un rectangle arrondi par bloc, un peu plus large que le texte (surtout à gauche,
// là où il y a une case ou une puce), avec un mince espace entre deux blocs voisins ; le bleu de l'accent, léger, laisse lire le texte.

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Le rectangle à dessiner autour d'un bloc dont la zone de contenu mesure `r`. */
export function selectionBox(r: { left: number; top: number; width: number; height: number }): Box {
  return { left: r.left - 10, top: r.top + 1, width: r.width + 20, height: Math.max(0, r.height - 2) }
}

/** Le rectangle du texte d'un bloc : un bloc coloré déborde déjà de 6 px de chaque côté (voir index.css), on le ramène à l'alignement des autres : son fond reste donc 4 px à l'intérieur du rectangle de sélection, comme dans Notion. */
export function textRect(el: HTMLElement): Box {
  const r = el.getBoundingClientRect()
  const bg = el.getAttribute('data-background-color')
  const grown = bg && bg !== 'default' && el.getAttribute('data-content-type') !== 'callout' ? 6 : 0
  return { left: r.left + grown, top: r.top, width: r.width - 2 * grown, height: r.height }
}

/** La couleur de remplissage : l'accent de l'appli à 15 % (le texte et les couleurs de fond restent visibles dessous). */
export const SELECTION_FILL = 'color-mix(in srgb, var(--accent) 15%, transparent)'
