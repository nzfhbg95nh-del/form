// Fruits et légumes de saison (France et Belgique) : quels mois ils sont récoltés ou bien disponibles en local.
// Sert à proposer des recettes cohérentes avec la saison. Repères généraux (calendriers ADEME / Interfel) ; les surgelés et conserves ne comptent pas.
// Logique pure, testée automatiquement.

import { fold, ingredientKey } from './shoppingList'

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
/** Mois d'une période qui peut passer d'une année à l'autre (de 10 à 3 = octobre à mars). */
const span = (from: number, to: number): number[] => (from <= to ? ALL.filter((m) => m >= from && m <= to) : ALL.filter((m) => m >= from || m <= to))

/** Clé d'ingrédient (début) -> mois de saison. Les produits de garde ou disponibles toute l'année (oignon, carotte, pomme de terre…) n'y sont pas. */
const SEASONS: [RegExp, number[], string][] = [
  [/^tomate(?! (seche|concasse|pelee|en conserve))/, span(6, 10), 'tomate'],
  [/^courgette/, span(6, 9), 'courgette'],
  [/^aubergine/, span(6, 9), 'aubergine'],
  [/^poivron/, span(7, 10), 'poivron'],
  [/^concombre/, span(5, 9), 'concombre'],
  [/^haricot vert/, span(6, 9), 'haricots verts'],
  [/^mais doux|^epi de mais/, span(8, 9), 'maïs frais'],
  [/^artichaut/, span(5, 9), 'artichaut'],
  [/^asperge/, span(4, 6), 'asperges'],
  [/^petit poi(?!.*surgele)|^poi frai/, span(5, 7), 'petits pois frais'],
  [/^feve/, span(5, 7), 'fèves'],
  [/^radis/, span(4, 7), 'radis'],
  [/^fenouil(?! graine|.*graine)/, span(6, 11), 'fenouil'],
  [/^blette|^bette/, span(6, 11), 'blettes'],
  [/^brocoli/, span(6, 11), 'brocoli'],
  [/^epinard/, [3, 4, 5, 6, 9, 10, 11], 'épinards'],
  [/^laitue|^salade verte|^roquette|^batavia/, span(4, 10), 'salade'],
  [/^mache/, span(10, 3), 'mâche'],
  [/^chou fleur/, span(9, 4), 'chou-fleur'],
  [/^chou de bruxelle/, span(10, 3), 'choux de Bruxelles'],
  [/^chou kale|^kale/, span(10, 3), 'chou kale'],
  [/^chou(?! fleur| de bruxelle| kale)/, span(10, 3), 'chou'],
  [/^courge|^potiron|^butternut|^potimarron|^citrouille/, span(9, 2), 'courge'],
  [/^poireau/, span(9, 4), 'poireau'],
  [/^endive/, span(10, 4), 'endive'],
  [/^panai/, span(10, 3), 'panais'],
  [/^navet/, span(10, 3), 'navet'],
  [/^topinambour/, span(10, 3), 'topinambour'],
  [/^celeri rave/, span(9, 3), 'céleri-rave'],
  [/^celeri/, span(6, 11), 'céleri branche'],
  [/^basilic/, span(6, 9), 'basilic frais'],
  [/^piment vert|^jalapeno|^piment frai/, span(7, 10), 'piment frais'],
  // Fruits
  [/^fraise/, span(4, 7), 'fraises'],
  [/^framboise/, span(6, 9), 'framboises'],
  [/^cerise/, span(5, 7), 'cerises'],
  [/^abricot/, span(6, 8), 'abricots'],
  [/^peche|^nectarine|^brugnon/, span(6, 9), 'pêches'],
  [/^melon/, span(6, 9), 'melon'],
  [/^pasteque/, span(7, 9), 'pastèque'],
  [/^prune|^mirabelle|^reine claude/, span(7, 9), 'prunes'],
  [/^myrtille/, span(7, 9), 'myrtilles'],
  [/^figue(?! seche)/, span(8, 10), 'figues'],
  [/^raisin(?! sec)/, span(8, 10), 'raisin'],
  [/^rhubarbe/, span(4, 6), 'rhubarbe'],
  [/^coing/, span(10, 11), 'coing'],
  [/^chataigne|^marron(?! glace)/, span(10, 12), 'châtaignes'],
  [/^grenade/, span(10, 1), 'grenade'],
  [/^kiwi/, span(11, 4), 'kiwi'],
  [/^clementine|^mandarine/, span(11, 2), 'clémentines'],
  [/^orange(?! amere)/, span(12, 4), 'oranges'],
  [/^pomme(?! de terre)/, span(8, 5), 'pommes'],
  [/^poire/, span(8, 1), 'poires'],
]

/** Ce qui ne dépend pas de la saison (surgelé, conserve, séché, en poudre, jus en bouteille, sauce…). */
const NOT_FRESH = /surgel|conserve|boite|appertis|seche|sechee|en poudre|concentre|puree|coulis|passata|sauce|confit|en bocal|jus d|compote|confiture/

export interface SeasonInfo {
  /** Produits frais de la recette qui sont de saison ce mois-ci. */
  inSeason: string[]
  /** Produits frais hors saison. */
  outOfSeason: string[]
}

/** Le nom de saison d'un ingrédient frais et ses mois, ou null s'il ne dépend pas de la saison. */
export function seasonOf(line: string): { name: string; months: number[] } | null {
  const raw = fold(line)
  if (NOT_FRESH.test(raw)) return null
  const key = ingredientKey(line.replace(/^\s*[\d.,/½¼¾⅓⅔ ]+\s*(g|kg|ml|cl|l)?\b/i, ''))
  const hit = SEASONS.find(([re]) => re.test(key) || re.test(raw.replace(/^[\d.,/ ]+/, '').trim()))
  return hit ? { name: hit[2], months: hit[1] } : null
}

/** Les produits frais de saison et hors saison d'une recette, pour un mois (1 à 12). */
export function recipeSeason(lines: string[], month: number): SeasonInfo {
  const inSeason = new Set<string>()
  const outOfSeason = new Set<string>()
  for (const l of lines) {
    const s = seasonOf(l)
    if (!s) continue
    ;(s.months.includes(month) ? inSeason : outOfSeason).add(s.name)
  }
  return { inSeason: [...inSeason], outOfSeason: [...outOfSeason] }
}

/** Petit score de saison : + pour chaque produit de saison, − (plus fort) pour chaque produit hors saison. */
export function seasonScore(info: SeasonInfo): number {
  return Math.min(2, info.inSeason.length * 0.5) - info.outOfSeason.length * 1.5
}

/** Les fruits et légumes de saison du mois (pour les conseils). */
export function inSeasonNames(month: number): string[] {
  return [...new Set(SEASONS.filter(([, months]) => months.includes(month)).map(([, , name]) => name))]
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export const monthName = (month: number) => MONTHS[month - 1]
