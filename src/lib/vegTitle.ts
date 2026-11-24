// Le nom végé d'une recette qui a une « Version sans viande / sans poisson » : Victor mange végé, donc partout
// (planning, courses, meal prep, nutrition, idées) on affiche ce nom ; la recette d'origine reste dans la page.
// Le nom vient du titre de la section (« Version sans viande : Tikka masala de tofu ») s'il y en a un,
// sinon il est fabriqué d'après la phrase « Le poulet est remplacé par du tofu… ». Logique pure, testée automatiquement.

import { parseContent } from './content'
import { displayTitle } from './lastEdit'
import { fold } from './shoppingList'

interface BlockLike { type?: string; content?: unknown; children?: BlockLike[] }
const textOf = (content: unknown): string => (Array.isArray(content) ? content.map((c) => (c && typeof c === 'object' ? (c as { text?: string }).text ?? '' : '')).join('') : '')

/** Le titre de la section « Version sans… » et la phrase qui la suit. */
export function variantInfo(blocks: unknown): { heading: string; intro: string } | null {
  const flat: BlockLike[] = []
  const walk = (l: BlockLike[]) => { for (const b of l) { flat.push(b); if (b.children?.length) walk(b.children) } }
  walk((Array.isArray(blocks) ? blocks : []) as BlockLike[])
  const i = flat.findIndex((b) => b.type === 'heading' && fold(textOf(b.content)).startsWith('version sans'))
  if (i < 0) return null
  let intro = ''
  for (const b of flat.slice(i + 1)) {
    if (b.type === 'heading') break
    const t = textOf(b.content).trim()
    if (t) { intro = t; break }
  }
  return { heading: textOf(flat[i].content).trim(), intro }
}

const STOP = /\s*[(:,.;«]|\s+(?:et|ou|mijot\S*|marin\S*\s+puis|grill\S*\s+puis)\s+/
/** « Le poulet est remplacé par du tofu ferme mariné (ou du paneer) » → { meat: 'poulet', sub: 'tofu ferme mariné' }. */
export function swapOf(intro: string): { meat: string; sub: string } | null {
  const m = /^(?:les?|la|l['’])\s*(.+?)\s+(?:(?:est|sont)\s+remplac\S*\s+par|devien(?:t|nent))\s+(?:des |du |de la |de l['’]|d['’]|un |une |les |le |la |l['’])?(.+)$/i.exec(intro.trim())
  if (!m) return null
  const sub = cleanSub(m[2].split(STOP)[0])
  return sub ? { meat: m[1].trim(), sub } : null
}

/** « mélange lentilles brunes » → « lentilles brunes », « tofu ferme mariné » → « tofu ferme », « pois chiches écrasés façon » → « pois chiches ». */
function cleanSub(sub: string): string {
  let s = sub.trim().replace(/^(?:m[ée]lange(?: de| d['’])?|tranches? de|morceaux de|cubes de)\s+/i, '')
  for (let i = 0; i < 2; i++) s = s.replace(/\s+(?:fa[çc]on|[ée]cras[ée]e?s?|[ée]miett[ée]e?s?|marin[ée]e?s?|grill[ée]e?s?|press[ée]e?s?|cuite?s?)$/i, '')
  return s.trim()
}

const MEAT_WORDS = /(poulet katsu|poulet|chicken|b(?:oe|œ)uf hach[ée]|b(?:oe|œ)uf|viande|thon|saumon fum[ée]|saumon|sardines?|cabillaud|bacon|poisson blanc|poisson|crevettes?)/i
const vowel = (s: string) => /^[aeiouyâàéèêîôûœ]/i.test(s)

/** Remplace le premier mot de viande ou de poisson du titre (avec sa préposition) par le plat de remplacement. */
function replaceIn(title: string, word: RegExp, sub: string): string | null {
  const re = new RegExp(`(?<=^|[\\s(,])((?:de |d['’]|au |aux |à la |à l['’])?)${word.source}`, 'i')
  const m = re.exec(title)
  if (!m) return null
  const prep = m[1].trim().toLowerCase()
  // « de sardines » → « de pois chiches » ; « au saumon », « à la viande » → « au tofu fumé », « aux lentilles ».
  const plural = /[sx]$/.test(sub.split(' ')[0])
  const lead = prep === '' ? '' : prep.startsWith('d') ? (vowel(sub) ? 'd’' : 'de ') : plural ? 'aux ' : 'au '
  let out = title.slice(0, m.index) + lead + sub + title.slice(m.index + m[0].length)
  out = out.replace(/\s{2,}/g, ' ').trim()
  return out.charAt(0).toUpperCase() + out.slice(1)
}

/** Le nom végé d'une recette (le titre tel quel s'il n'y a pas de version sans viande). */
export function vegTitle(title: string, info: { heading: string; intro: string } | null): string {
  if (!info) return title
  const named = /^version sans [^:]+:\s*(.+)$/i.exec(info.heading)
  if (named) return named[1].trim()
  const swap = swapOf(info.intro)
  if (!swap) return `${title} (végé)`
  const meatRe = new RegExp(swap.meat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  return replaceIn(title, meatRe, swap.sub) ?? replaceIn(title, MEAT_WORDS, swap.sub) ?? `${title} (végé : ${swap.sub})`
}

// Le nom végé de chaque recette, gardé tant que la page ne change pas.
const cache = new Map<string, string>()
/** Le nom à afficher pour un plat : végé s'il y a une version sans viande. */
export function dishTitle(row: { id: string; title: string | null; content: string | null; updated_at?: string }): string {
  const key = `${row.id}:${row.updated_at ?? ''}:${row.title ?? ''}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const title = displayTitle(row.title)
  const out = row.content && row.content.includes('ersion sans') ? vegTitle(title, variantInfo(parseContent(row.content))) : title
  cache.set(key, out)
  return out
}
