// Cueillette sauvage : quand cueillir les plantes que les recettes de Victor utilisent (fleurs de sureau, tilleul, lilas, ail des ours…).
// Périodes indicatives pour la Belgique et le nord de la France (elles varient d'une à deux semaines selon l'année et l'altitude).
// Logique pure, testée automatiquement.

import { fold } from './shoppingList'

export interface Plant {
  id: string
  name: string
  /** Ce qui, dans le titre ou les ingrédients d'une recette, désigne cette cueillette. */
  match: RegExp
  /** Début et fin de la période [mois, jour]. */
  from: [number, number]
  to: [number, number]
  tip: string
}

export const PLANTS: Plant[] = [
  { id: 'ail-ours', name: 'Ail des ours', match: /ail des ours/, from: [3, 1], to: [4, 30], tip: 'Feuilles avant la floraison, en sous-bois humide. Attention : il ressemble au muguet et au colchique, toxiques — l’ail des ours sent l’ail quand on froisse la feuille.' },
  { id: 'ortie', name: 'Jeunes orties', match: /\borties?\b/, from: [3, 1], to: [5, 31], tip: 'Les 4 à 6 feuilles du haut, avec des gants, avant la floraison.' },
  { id: 'pissenlit', name: 'Pissenlit', match: /pissenlit/, from: [3, 15], to: [5, 31], tip: 'Jeunes feuilles avant la floraison (moins amères), fleurs bien ouvertes au soleil.' },
  { id: 'violette', name: 'Violettes', match: /violette/, from: [3, 1], to: [4, 30], tip: 'Fleurs par temps sec, en laissant les plantes en place.' },
  { id: 'tilleul-feuille', name: 'Jeunes feuilles de tilleul', match: /feuilles? de tilleul|jeunes? feuilles? de tilleul/, from: [4, 1], to: [5, 31], tip: 'Feuilles tendres et brillantes du printemps, à manger en salade.' },
  { id: 'lilas', name: 'Fleurs de lilas', match: /lilas/, from: [4, 15], to: [5, 31], tip: 'Grappes bien parfumées, fraîchement ouvertes, par temps sec ; ne garder que les petites fleurs.' },
  { id: 'aubepine', name: 'Fleurs d’aubépine', match: /aubepine/, from: [4, 15], to: [5, 31], tip: 'Fleurs juste ouvertes, loin des routes.' },
  { id: 'sapin', name: 'Bourgeons de sapin', match: /bourgeons? de sapin|pousses? de sapin|epicea/, from: [4, 15], to: [5, 31], tip: 'Jeunes pousses vert tendre, quelques-unes par arbre seulement.' },
  { id: 'acacia', name: 'Fleurs d’acacia', match: /acacia|robinier/, from: [5, 15], to: [6, 15], tip: 'Grappes blanches bien ouvertes. Seules les fleurs se mangent (écorce, feuilles et graines sont toxiques).' },
  { id: 'sureau-fleur', name: 'Fleurs de sureau', match: /(fleurs?|ombelles?) de sureau|sureau(?!.*baie)/, from: [5, 15], to: [6, 30], tip: 'Ombelles bien ouvertes, par temps sec et ensoleillé, sans secouer le pollen. Retirer les tiges vertes.' },
  { id: 'coquelicot', name: 'Coquelicots', match: /coquelicot/, from: [5, 15], to: [7, 15], tip: 'Pétales le matin, une fois la rosée séchée.' },
  { id: 'figuier', name: 'Feuilles de figuier', match: /feuilles? de figuier|figuier/, from: [5, 15], to: [9, 30], tip: 'Jeunes feuilles bien vertes (le latex peut irriter la peau : porter des gants).' },
  { id: 'menthe', name: 'Menthe', match: /menthe sauvage/, from: [5, 1], to: [9, 30], tip: 'Sommités avant la floraison.' },
  { id: 'tilleul-fleur', name: 'Fleurs de tilleul', match: /(?<!(fruits?|graines?|feuilles?) de )tilleul/, from: [6, 15], to: [7, 31], tip: 'Fleurs avec leur bractée, au début de la floraison, par temps sec ; les faire sécher à l’ombre.' },
  { id: 'reine-des-pres', name: 'Reine-des-prés', match: /reine.des.pres/, from: [6, 15], to: [8, 31], tip: 'Sommités fleuries, au bord des fossés et prairies humides.' },
  { id: 'verveine', name: 'Verveine citronnelle', match: /verveine/, from: [6, 15], to: [9, 30], tip: 'Feuilles avant et pendant la floraison, à sécher à l’ombre.' },
  { id: 'fraise-bois', name: 'Fraises des bois', match: /fraises? des bois/, from: [6, 1], to: [7, 31], tip: 'Fruits bien rouges, en lisière de bois.' },
  { id: 'tilleul-fruit', name: 'Fruits de tilleul', match: /(fruits?|graines?) de tilleul/, from: [8, 1], to: [9, 30], tip: 'Petites boules encore vertes à brun clair, avec leur bractée, à faire sécher.' },
  { id: 'mure', name: 'Mûres', match: /\b(de |d )mures?\b|\bmures? sauvages?|"mures?\b/, from: [8, 1], to: [9, 30], tip: 'Fruits noirs et brillants, en hauteur (loin des chiens et des routes).' },
  { id: 'sureau-baie', name: 'Baies de sureau', match: /baies? de sureau/, from: [8, 15], to: [9, 30], tip: 'Grappes bien noires. À consommer toujours cuites, jamais crues ; retirer toutes les tiges.' },
  { id: 'noisette', name: 'Noisettes', match: /noisettes? sauvages?/, from: [9, 1], to: [10, 15], tip: 'Quand elles tombent toutes seules et se détachent de leur collerette.' },
  { id: 'chataigne', name: 'Châtaignes', match: /chataigne/, from: [10, 1], to: [11, 15], tip: 'Ramassées au sol, bogue ouverte ; les vers se repèrent à un petit trou.' },
  { id: 'cynorhodon', name: 'Cynorhodons (églantier)', match: /cynorhodon|eglantier|eglantine/, from: [10, 1], to: [11, 30], tip: 'Fruits rouges et un peu mous ; retirer les poils intérieurs (irritants).' },
  { id: 'prunelle', name: 'Prunelles', match: /prunelle/, from: [10, 15], to: [12, 31], tip: 'Après les premières gelées, elles sont moins âpres.' },
]

/** Le jour de l'année (1 à 366) d'une date [mois, jour], dans l'année de `ref`. */
const dayOf = (year: number, [m, d]: [number, number]) => Math.round((Date.UTC(year, m - 1, d) - Date.UTC(year, 0, 1)) / 86400000) + 1

export type ForageStatus = 'now' | 'soon'

export interface ForageAlert {
  plant: Plant
  status: ForageStatus
  /** Jours avant le début (« bientôt ») ou avant la fin (« c'est le moment »). */
  days: number
  window: string
  recipes: { id: string; title: string }[]
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export const windowLabel = (p: Plant) => `du ${p.from[1] === 1 ? '1er' : p.from[1]} ${MONTHS[p.from[0] - 1]} au ${p.to[1] === 1 ? '1er' : p.to[1]} ${MONTHS[p.to[0] - 1]}`

/** Où en est la cueillette d'une plante à cette date : en cours, bientôt (dans `soonDays` jours au plus), ou rien. */
export function forageStatus(p: Plant, date: Date, soonDays = 30): { status: ForageStatus; days: number } | null {
  const y = date.getFullYear()
  const today = dayOf(y, [date.getMonth() + 1, date.getDate()])
  const start = dayOf(y, p.from)
  const end = dayOf(y, p.to)
  if (today >= start && today <= end) return { status: 'now', days: end - today }
  // Le début peut être l'an prochain (on est en décembre, la plante commence en mars).
  const until = today < start ? start - today : dayOf(y + 1, p.from) + (dayOf(y, [12, 31]) - today)
  return until <= soonDays ? { status: 'soon', days: until } : null
}

/** Les cueillettes à prévenir, d'après le titre et les ingrédients des recettes de Victor. En cours d'abord, puis les plus proches. */
export function forageAlerts(recipes: { id: string; title: string; text: string }[], date: Date, soonDays = 30): ForageAlert[] {
  const out: ForageAlert[] = []
  for (const p of PLANTS) {
    const using = recipes.filter((r) => p.match.test(fold(`${r.title} ${r.text}`).replace(/['’]/g, ' ')))
    if (using.length === 0) continue
    const st = forageStatus(p, date, soonDays)
    if (!st) continue
    out.push({ plant: p, ...st, window: windowLabel(p), recipes: using.map((r) => ({ id: r.id, title: r.title })) })
  }
  return out.sort((a, b) => (a.status === b.status ? a.days - b.days : a.status === 'now' ? -1 : 1))
}

/** Le calendrier de l'année pour les plantes des recettes (pour voir ce qui vient ensuite). */
export function forageCalendar(recipes: { id: string; title: string; text: string }[]): { plant: Plant; window: string; recipes: { id: string; title: string }[] }[] {
  return PLANTS.map((p) => ({ plant: p, window: windowLabel(p), recipes: recipes.filter((r) => p.match.test(fold(`${r.title} ${r.text}`).replace(/['’]/g, ' '))).map((r) => ({ id: r.id, title: r.title })) }))
    .filter((x) => x.recipes.length > 0)
    .sort((a, b) => a.plant.from[0] - b.plant.from[0] || a.plant.from[1] - b.plant.from[1])
}
