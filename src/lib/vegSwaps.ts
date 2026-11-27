// Recettes avec viande ou poisson sans version végé écrite : par quoi remplacer, ingrédient par ingrédient.
// Des équivalences simples et courantes (texture et cuisson proches), pour donner une piste tout de suite.

import { fold } from './shoppingList'

export interface VegSwap {
  /** Ce qu'on trouve dans la recette (« poulet »). */
  meat: string
  /** Par quoi le remplacer. */
  sub: string
  /** Un conseil de cuisson, court. */
  tip: string
}

const SWAPS: { re: RegExp; meat: string; sub: string; tip: string }[] = [
  { re: /\b(steak hache|boeuf hache|viande hachee|hache)\b/, meat: 'viande hachée', sub: 'lentilles brunes cuites ou protéines de soja texturées', tip: 'Réhydrate le soja dans un bouillon chaud, ou écrase un peu les lentilles pour lier.' },
  { re: /\b(poulet|dinde|chicken)\b/, meat: 'poulet', sub: 'tofu ferme ou paneer', tip: 'Presse le tofu 15 min, coupe en cubes et fais-le dorer avant la sauce ; même marinade.' },
  { re: /\b(boeuf|veau|agneau|steak)\b/, meat: 'bœuf', sub: 'seitan ou gros champignons (portobellos)', tip: 'Saisis à feu vif pour colorer, puis mijote moins longtemps.' },
  { re: /\b(lardons?|bacon|jambon|chorizo)\b/, meat: 'lardons, jambon', sub: 'tofu fumé', tip: 'Coupe en petits dés et fais revenir jusqu’à ce qu’ils soient croustillants.' },
  { re: /\b(porc|saucisses?|merguez)\b/, meat: 'porc, saucisses', sub: 'saucisses végétales ou tempeh', tip: 'Fais-les dorer à part et ajoute-les en fin de cuisson.' },
  { re: /\b(saumon|thon|cabillaud|poisson|sardines?|anchois)\b/, meat: 'poisson', sub: 'tofu ferme (ou pois chiches écrasés pour le thon)', tip: 'Une feuille de nori émiettée et un filet de citron rappellent le goût de la mer.' },
  { re: /\b(crevettes?|gambas)\b/, meat: 'crevettes', sub: 'pois chiches rôtis ou pleurotes', tip: 'Rôtis 15 min à 200 °C avec un peu d’huile et de paprika.' },
  { re: /\b(canard)\b/, meat: 'canard', sub: 'seitan ou jacquier', tip: 'Laque-le avec la même sauce et passe-le au four quelques minutes.' },
]

/** Les remplacements à proposer pour ces lignes d'ingrédients (chacun une seule fois, dans l'ordre où la viande apparaît). */
export function vegSwaps(lines: string[]): VegSwap[] {
  const text = fold(lines.join(' \n ').replace(/œ/gi, 'oe')).replace(/['’]/g, ' ')
  const found: { at: number; swap: VegSwap }[] = []
  for (const s of SWAPS) {
    const m = s.re.exec(text)
    if (m && !found.some((f) => f.swap.meat === s.meat)) found.push({ at: m.index, swap: { meat: s.meat, sub: s.sub, tip: s.tip } })
  }
  // Une viande hachée n'est pas aussi du bœuf : on garde la plus précise.
  const ids = new Set(found.map((f) => f.swap.meat))
  return found.filter((f) => !(f.swap.meat === 'bœuf' && ids.has('viande hachée'))).sort((a, b) => a.at - b.at).map((f) => f.swap)
}
