// Bilan nutritionnel d'une semaine du planning et conseils pour une alimentation sans viande (végétarienne : œufs et laitages possibles).
// Logique pure, testée automatiquement. Ce sont des repères généraux (ANSES, EFSA), pas un avis médical.

import { REFERENCES, type NutrientKey, type Reference, type Totals } from './nutrition'
import { DAY_NAMES, type Meal } from './mealPlan'

/** Le midi et le soir du planning représentent à peu près cette part des apports d'une journée (le reste : petit-déjeuner, collations). */
export const MAIN_MEALS_SHARE = 0.7

export interface PlannedMeal {
  day: number
  meal: Meal
  recipeId: string
  title: string
  /** Nutriments d'une portion (une personne). */
  perServing: Totals
}

export interface NutrientStatus {
  ref: Reference
  /** Une journée type : moyenne d'un repas planifié × 2 (midi + soir), pour une personne. */
  average: number | null
  /** Repère pour midi + soir (part MAIN_MEALS_SHARE du repère journalier). */
  target: number
  percent: number | null
}

export interface WeekReport {
  days: number
  meals: number
  status: NutrientStatus[]
}

/**
 * Une journée type d'une personne : la moyenne d'un repas planifié, multipliée par deux (midi + soir), comparée à la part « midi + soir »
 * des repères journaliers. (Une moyenne par jour serait faussée par les jours où un seul repas est prévu.)
 */
export function weekReport(meals: PlannedMeal[]): WeekReport {
  const days = new Set(meals.map((m) => m.day)).size
  const sum: Totals = {}
  for (const m of meals) for (const [k, v] of Object.entries(m.perServing) as [NutrientKey, number][]) sum[k] = (sum[k] ?? 0) + v
  const status = REFERENCES.map((ref) => {
    const average = meals.length > 0 && sum[ref.key] !== undefined ? (sum[ref.key]! / meals.length) * 2 : null
    const target = ref.daily * MAIN_MEALS_SHARE
    return { ref, average, target, percent: average === null ? null : Math.round((average / target) * 100) }
  })
  return { days, meals: meals.length, status }
}

export interface Advice {
  id: string
  level: 'manque' | 'attention' | 'bon' | 'info'
  title: string
  text: string
  /** Aliments qui aident (texte), et recettes de Victor qui en apportent le plus (identifiants et titres). */
  foods?: string[]
  recipes?: { id: string; title: string; amount: string }[]
}

export interface RecipeFacts {
  id: string
  title: string
  perServing: Totals
}

const fmt = (v: number, unit: string) => `${String(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).replace('.', ',')} ${unit}`

/** Les recettes qui apportent le plus d'un nutriment par portion (au moins `min`). */
export function topRecipes(all: RecipeFacts[], key: NutrientKey, unit: string, count = 3, min = 0, exclude: Set<string> = new Set()): Advice['recipes'] {
  return all
    .filter((r) => (r.perServing[key] ?? 0) > min && !exclude.has(r.id))
    .sort((a, b) => (b.perServing[key] ?? 0) - (a.perServing[key] ?? 0))
    .slice(0, count)
    .map((r) => ({ id: r.id, title: r.title, amount: fmt(r.perServing[key]!, unit) }))
}

const label = (m: PlannedMeal) => `${DAY_NAMES[m.day].toLowerCase()} ${m.meal}`

/**
 * Les conseils de la semaine. `month` (1 à 12) sert au rappel de vitamine D en hiver.
 * Pour une alimentation sans viande, le fer végétal s'absorbe moins bien : on vise plus haut (repère × 1,3, prudent) et on soigne la vitamine C.
 */
export function weekAdvice(report: WeekReport, meals: PlannedMeal[], all: RecipeFacts[], month: number): Advice[] {
  const out: Advice[] = []
  if (report.meals === 0) return out
  const get = (k: NutrientKey) => report.status.find((s) => s.ref.key === k)!
  const planned = new Set(meals.map((m) => m.recipeId))

  // Énergie basse : souvent les accompagnements (riz, pain, naan) qui ne sont pas dans la recette.
  const kcal = get('kcal')
  if (kcal.percent !== null && kcal.percent < 65) {
    out.push({
      id: 'accompagnements', level: 'info',
      title: `Tes plats couvrent environ ${kcal.percent} % de l’énergie attendue sur midi et soir`,
      text: 'Les accompagnements (riz, pain, naan, pâtes) ne sont comptés que s’ils sont écrits dans la recette. Note-les dans le suivi quotidien pour un bilan plus juste : les protéines et le fer remontent aussi.',
    })
  }

  // Fer : quantité, puis absorption repas par repas.
  const fe = get('fe')
  const feGoal = fe.target * 1.3
  if (fe.average !== null && fe.average < feGoal) {
    out.push({
      id: 'fer', level: fe.average < fe.target * 0.75 ? 'manque' : 'attention',
      title: `Fer : ${fmt(fe.average, 'mg')} par jour sur midi et soir`,
      text: `Sans viande, le fer des végétaux s’absorbe moins bien : mieux vaut viser environ ${fmt(feGoal, 'mg')} sur ces deux repas. Les légumineuses, le tofu et les graines en apportent beaucoup.`,
      foods: ['lentilles', 'pois chiches', 'haricots rouges', 'tofu', 'graines de courge', 'sésame / tahini', 'épinards', 'flocons d’avoine'],
      recipes: topRecipes(all, 'fe', 'mg', 3, 2, planned),
    })
  }
  const poorAbsorption = meals.filter((m) => (m.perServing.fe ?? 0) >= 2.5 && (m.perServing.vitc ?? 0) < 20)
  if (poorAbsorption.length > 0) {
    out.push({
      id: 'fer-vitc', level: 'attention',
      title: 'Mieux absorber le fer : ajoute de la vitamine C',
      text: `Ces repas sont riches en fer mais pauvres en vitamine C : ${poorAbsorption.slice(0, 4).map((m) => `${m.title} (${label(m)})`).join(', ')}. Un peu de vitamine C dans le même repas aide beaucoup à absorber le fer végétal. Et garde le thé ou le café à au moins une heure du repas.`,
      foods: ['poivron cru', 'persil ou coriandre fraîche', 'jus de citron', 'brocoli', 'chou', 'tomate crue', 'un agrume ou un kiwi en dessert'],
    })
  }

  // Protéines.
  const prot = get('prot')
  if (prot.average !== null && prot.average < prot.target * 0.85) {
    out.push({
      id: 'proteines', level: prot.average < prot.target * 0.65 ? 'manque' : 'attention',
      title: `Protéines : ${fmt(prot.average, 'g')} par jour sur midi et soir`,
      text: `Repère pour ces deux repas : environ ${fmt(prot.target, 'g')}. Associer une légumineuse et une céréale dans la journée (riz et dahl, houmous et pain, chili et maïs) donne des protéines complètes.`,
      foods: ['légumineuses', 'tofu / tempeh', 'œufs', 'yaourt grec / skyr', 'fromage', 'graines et oléagineux'],
      recipes: topRecipes(all, 'prot', 'g', 3, 15, planned),
    })
  }

  // Oméga-3.
  const ala = get('ala')
  if (ala.average !== null && ala.average < ala.target * 0.8) {
    out.push({
      id: 'omega3', level: 'attention',
      title: `Oméga-3 : ${fmt(ala.average, 'g')} par jour`,
      text: 'Sans poisson, les oméga-3 viennent surtout de quelques aliments : une cuillère à soupe d’huile de colza ou de noix par jour, ou deux cuillères de graines de lin moulues, suffisent.',
      foods: ['huile de colza', 'huile de noix', 'noix', 'graines de lin moulues', 'graines de chia'],
    })
  }

  // Calcium.
  const ca = get('ca')
  if (ca.average !== null && ca.average < ca.target * 0.75) {
    out.push({
      id: 'calcium', level: 'attention',
      title: `Calcium : ${fmt(ca.average, 'mg')} par jour sur midi et soir`,
      text: 'Un yaourt ou un morceau de fromage au petit-déjeuner, ou une eau riche en calcium, complètent facilement.',
      foods: ['yaourt', 'fromage', 'tofu', 'amandes', 'chou kale', 'eaux minérales riches en calcium'],
      recipes: topRecipes(all, 'ca', 'mg', 3, 200, planned),
    })
  }

  // Zinc.
  const zn = get('zn')
  if (zn.average !== null && zn.average < zn.target * 0.75) {
    out.push({
      id: 'zinc', level: 'attention',
      title: `Zinc : ${fmt(zn.average, 'mg')} par jour sur midi et soir`,
      text: 'Le zinc végétal s’absorbe mieux quand les légumineuses et céréales sont trempées, germées ou fermentées (pain au levain).',
      foods: ['graines de courge', 'pois chiches', 'lentilles', 'noix de cajou', 'flocons d’avoine', 'fromage'],
    })
  }

  // Fibres, sel, saturés.
  const fib = get('fibres')
  if (fib.average !== null && fib.average < fib.target * 0.7) {
    out.push({ id: 'fibres', level: 'attention', title: `Fibres : ${fmt(fib.average, 'g')} par jour`, text: 'Plus de légumes, de légumineuses et de céréales complètes aideraient.', foods: ['légumineuses', 'légumes', 'céréales complètes', 'fruits'] })
  }
  const sel = get('sel')
  if (sel.average !== null && sel.average > sel.target) {
    out.push({ id: 'sel', level: 'attention', title: `Sel : ${fmt(sel.average, 'g')} par jour sur midi et soir`, text: `C’est au-dessus du repère (6 g pour toute la journée). Les sauces, le fromage et les bouillons en apportent beaucoup.` })
  }
  const ags = get('ags')
  if (ags.average !== null && ags.average > ags.target * 1.1) {
    out.push({ id: 'satures', level: 'attention', title: `Graisses saturées : ${fmt(ags.average, 'g')} par jour`, text: 'Beurre, crème, fromage et lait de coco en apportent beaucoup : une partie peut être remplacée par de l’huile de colza ou d’olive.' })
  }

  // Variété.
  const counts = new Map<string, { title: string; n: number }>()
  for (const m of meals) counts.set(m.recipeId, { title: m.title, n: (counts.get(m.recipeId)?.n ?? 0) + 1 })
  const repeated = [...counts.values()].filter((c) => c.n >= 4)
  if (repeated.length > 0) out.push({ id: 'variete', level: 'info', title: 'Varier un peu', text: `${repeated.map((r) => `${r.title} revient ${r.n} fois`).join(', ')} : varier les plats aide à couvrir tous les nutriments.` })

  // Rappels qui valent toujours sans viande.
  const b12 = get('b12')
  out.push({
    id: 'b12', level: b12.average !== null && b12.average < b12.target * 0.6 ? 'attention' : 'info',
    title: 'Vitamine B12',
    text: `On la trouve presque seulement dans les produits animaux : œufs et laitages en apportent un peu${b12.average !== null ? ` (ici ${fmt(b12.average, 'µg')} par jour sur midi et soir)` : ''}. Beaucoup de végétariens prennent un complément : à voir avec un médecin ou un pharmacien.`,
  })
  out.push({ id: 'iode', level: 'info', title: 'Iode', text: 'Utilise du sel iodé ; laitages et œufs en apportent aussi. Les algues en contiennent beaucoup, mais avec modération.' })
  if (month >= 10 || month <= 3) {
    out.push({ id: 'vitd', level: 'info', title: 'Vitamine D en hiver', text: 'D’octobre à mars, en Belgique, le soleil ne suffit pas à en fabriquer. Un complément est souvent conseillé : à voir avec un médecin.' })
  }

  // Ce qui va bien (pour ne pas lire que des manques).
  const good = report.status.filter((s) => s.percent !== null && s.percent >= 90 && !s.ref.max && ['fe', 'prot', 'fibres', 'vitc', 'b9', 'mg', 'ca'].includes(s.ref.key))
  if (good.length > 0) out.unshift({ id: 'bon', level: 'bon', title: 'Ce qui va bien', text: `${good.map((s) => s.ref.label.toLowerCase()).join(', ')} : bien couverts par tes repas de la semaine.` })
  return out
}
