// Le rectangle de sélection d'un bloc, copié sur Notion (mesures prises sur une capture) :
//  - bloc ordinaire : le bleu dépasse de 6 px à gauche et à droite du texte, et se retire de 2 px en haut et en bas (4 px d'écart entre deux blocs) ;
//  - bloc coloré : son fond dépasse de 3 px autour du texte et le bleu dépasse de 3 px à gauche/droite et 2 px en haut/bas autour du fond.

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Le rectangle à dessiner autour d'un bloc ordinaire dont la zone de contenu mesure `r`. */
export function selectionBox(r: Box): Box {
  return { left: r.left - 6, top: r.top + 2, width: r.width + 12, height: Math.max(0, r.height - 4) }
}

/** Le rectangle bleu autour d'un bloc coloré dont le fond mesure `r`. */
export function coloredBox(r: Box): Box {
  return { left: r.left - 3, top: r.top - 2, width: r.width + 6, height: r.height + 4 }
}

/** Le rectangle bleu d'un bloc, à partir de son élément de contenu. */
export function blockBox(el: HTMLElement): Box {
  const r = el.getBoundingClientRect()
  const bg = el.getAttribute('data-background-color')
  const colored = bg && bg !== 'default' && el.getAttribute('data-content-type') !== 'callout'
  return colored ? coloredBox(r) : selectionBox(r)
}

/** La couleur de remplissage : l'accent de l'appli à 15 % (le texte et les couleurs de fond restent visibles dessous). */
export const SELECTION_FILL = 'color-mix(in srgb, var(--accent) 15%, transparent)'
