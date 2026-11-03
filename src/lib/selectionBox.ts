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
  return { left: r.left - 10, top: r.top + 1, width: r.width + 14, height: Math.max(0, r.height - 2) }
}

/** La couleur de remplissage : l'accent de l'appli à 15 % (le texte et les couleurs de fond restent visibles dessous). */
export const SELECTION_FILL = 'color-mix(in srgb, var(--accent) 15%, transparent)'
