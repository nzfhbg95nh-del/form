/**
 * Recalcul des quantités d'une recette selon le nombre de personnes.
 * Une ligne d'ingrédient commence par sa quantité : « 200 g de farine », « 1/2 citron », « 1 1/2 tasse de lait »,
 * « 2 à 3 oeufs », « ½ cuillère ». Une ligne sans quantité au début (« sel », « une pincée de poivre ») ne change pas.
 */

const VULGAR: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }
const NUMBER = String.raw`(?:\d+[ ]\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?(?:[ ]?[½¼¾⅓⅔⅛])?|[½¼¾⅓⅔⅛])`
const LEADING = new RegExp(String.raw`^(\s*)(${NUMBER})(?:(\s*(?:-|–|à|a|ou)\s*)(${NUMBER}))?(?![\d/])`, 'i')

/** Valeur numérique d'une quantité écrite (« 1,5 », « 1/2 », « 1 1/2 », « 2½ », « ½ »), ou null. */
export function parseNumber(text: string): number | null {
  const t = text.trim()
  if (t === '') return null
  let m = /^(\d+)[ ](\d+)\/(\d+)$/.exec(t)
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3])
  m = /^(\d+)\/(\d+)$/.exec(t)
  if (m) return Number(m[2]) === 0 ? null : Number(m[1]) / Number(m[2])
  m = /^(\d+(?:[.,]\d+)?)[ ]?([½¼¾⅓⅔⅛])$/.exec(t)
  if (m) return Number(m[1].replace(',', '.')) + VULGAR[m[2]]
  if (t in VULGAR) return VULGAR[t]
  m = /^\d+(?:[.,]\d+)?$/.exec(t)
  return m ? Number(t.replace(',', '.')) : null
}

/** Écrit un nombre pour une recette : sans décimales inutiles, en virgule française. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  const rounded = n >= 100 ? Math.round(n) : n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100
  return String(rounded).replace('.', ',')
}

export interface Quantity {
  /** Espaces avant la quantité. */
  lead: string
  value: number
  /** Deuxième valeur d'une fourchette (« 2 à 3 »). */
  upper?: number
  /** Texte entre les deux valeurs d'une fourchette (« - », « à »). */
  joiner?: string
  /** Le reste de la ligne après la quantité. */
  rest: string
}

/** Lit la quantité au début d'une ligne d'ingrédient, ou null s'il n'y en a pas. */
export function parseQuantity(line: string): Quantity | null {
  const m = LEADING.exec(line)
  if (!m) return null
  const value = parseNumber(m[2])
  if (value === null || value <= 0) return null
  const upper = m[4] !== undefined ? parseNumber(m[4]) : null
  if (m[4] !== undefined && (upper === null || upper <= value)) {
    // « 1 à 1 » ou valeur illisible : on ne traite que la première quantité.
    return { lead: m[1], value, rest: line.slice(m[0].length - (m[3]?.length ?? 0) - (m[4]?.length ?? 0)) }
  }
  return { lead: m[1], value, ...(upper !== null ? { upper, joiner: m[3] } : {}), rest: line.slice(m[0].length) }
}

/** Multiplie la quantité du début d'une ligne (les autres nombres du texte, comme « four à 180 °C », ne bougent pas). */
export function scaleLine(line: string, factor: number): string {
  const q = parseQuantity(line)
  if (!q || !Number.isFinite(factor) || factor <= 0 || factor === 1) return line
  const first = formatNumber(q.value * factor)
  const second = q.upper !== undefined ? `${q.joiner ?? ' à '}${formatNumber(q.upper * factor)}` : ''
  return `${q.lead}${first}${second}${q.rest}`
}

/** Facteur à appliquer pour passer de `from` personnes à `to` personnes (1 si l'un des deux est inconnu). */
export function scaleFactor(from: number | null | undefined, to: number | null | undefined): number {
  return from && to && from > 0 && to > 0 ? to / from : 1
}

export interface IngredientLine {
  id: string
  text: string
}

interface BlockLike {
  id?: string
  type: string
  props?: { level?: number }
  content?: unknown
  children?: BlockLike[]
}

const textOfContent = (content: unknown): string | null => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  return (content as { type?: string; text?: string }[]).every((c) => c.type === 'text' || c.type === undefined)
    ? (content as { text?: string }[]).map((c) => c.text ?? '').join('')
    : null
}

const normalized = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Les lignes d'ingrédients : les éléments de liste sous le titre « Ingrédients », jusqu'au titre suivant. */
export function extractIngredients(blocks: unknown[]): IngredientLine[] {
  const out: IngredientLine[] = []
  let inside = false
  const walk = (list: BlockLike[]) => {
    for (const b of list) {
      if (b.type === 'heading') {
        const title = textOfContent(b.content)
        inside = title !== null && normalized(title).startsWith('ingredient')
      } else if (inside && ['checkListItem', 'bulletListItem', 'numberedListItem', 'paragraph'].includes(b.type)) {
        const text = textOfContent(b.content)
        if (text !== null && text.trim() !== '' && b.id) out.push({ id: b.id, text })
      }
      if (b.children?.length) walk(b.children)
    }
  }
  walk(blocks as BlockLike[])
  return out
}
