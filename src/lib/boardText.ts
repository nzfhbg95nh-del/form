// Le texte du moodboard, comme dans Illustrator : un « texte de point » (un clic) s'agrandit en tapant, sans retour à la ligne automatique ;
// une « zone de texte » (un glisser) a une largeur fixe et revient à la ligne toute seule. Ici, la logique « pure » : mesure, retour à la ligne,
// paragraphes (retraits, espaces, listes, coupure des mots), ajustement de la boîte et redimensionnement.
// Le calcul de la largeur d'un texte est donné par l'appelant (`measure`), pour être testé sans écran.

import type { BoardItem } from './moodboard'

export const FONTS = ['Segoe UI', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact', 'Comic Sans MS']
export const DEFAULT_FONT = FONTS[0]
/** Marge autour du texte, dans la boîte. */
export const TEXT_PAD = 2
export const MIN_TEXT_WIDTH = 24

export type Caps = 'none' | 'all' | 'small'
export type Script = 'none' | 'sup' | 'sub'

export interface TextStyle {
  font: string
  size: number
  bold: boolean
  italic: boolean
  /** Épaisseur des lettres (300 fin, 400 normal, 600 demi-gras, 700 gras, 900 noir). */
  weight: number
  /** Espacement des lettres, en fraction de la taille (0 = normal). */
  ls: number
  /** Interlignage : hauteur d'une ligne, en fraction de la taille. */
  lh: number
  /** Échelle horizontale et verticale des lettres (1 = 100 %). */
  sx: number
  sy: number
  /** Décalage de la ligne de base, en points (positif = vers le haut). */
  base: number
  caps: Caps
  script: Script
  under: boolean
  strike: boolean
}

export const WEIGHTS: { value: number; label: string }[] = [
  { value: 300, label: 'Fin' },
  { value: 400, label: 'Normal' },
  { value: 600, label: 'Demi-gras' },
  { value: 700, label: 'Gras' },
  { value: 900, label: 'Noir' },
]

export const textStyleOf = (it: BoardItem): TextStyle => {
  const weight = it.weight ?? (it.bold ? 700 : 400)
  return {
    font: it.font ?? DEFAULT_FONT, size: it.size ?? 32, bold: weight >= 600, italic: !!it.italic, weight, ls: it.ls ?? 0, lh: it.lh ?? 1.2,
    sx: it.sx ?? 1, sy: it.sy ?? 1, base: it.base ?? 0, caps: it.caps ?? 'none', script: it.script ?? 'none', under: !!it.under, strike: !!it.strike,
  }
}

/** Les exposants et indices ont des lettres plus petites. */
export const SCRIPT_SCALE = 0.58
/** La taille réelle des lettres (plus petite pour un exposant ou un indice). */
export const glyphSize = (st: Pick<TextStyle, 'size' | 'script'>) => (st.script === 'none' ? st.size : Math.round(st.size * SCRIPT_SCALE * 100) / 100)
/** De combien le texte monte (négatif : descend) à cause de l'exposant, de l'indice et du décalage de ligne de base. */
export const lift = (st: Pick<TextStyle, 'size' | 'script' | 'base'>) => st.base + (st.script === 'sup' ? st.size * 0.35 : st.script === 'sub' ? -st.size * 0.12 : 0)

/** La police au format de l'écran (pour mesurer et pour dessiner). */
export const cssFont = (st: Pick<TextStyle, 'font' | 'size' | 'bold' | 'italic'> & Partial<Pick<TextStyle, 'weight' | 'caps' | 'script'>>) =>
  `${st.italic ? 'italic ' : ''}${st.caps === 'small' ? 'small-caps ' : ''}${st.weight ?? (st.bold ? 700 : 400)} ${glyphSize({ size: st.size, script: st.script ?? 'none' })}px "${st.font}", sans-serif`

/** Un texte de point : sans retour à la ligne automatique (tout texte qui n'est pas une zone de texte, y compris les anciens). */
export const isPointText = (it: BoardItem) => it.kind === 'text' && it.auto !== false

export type Measure = (text: string) => number

// ───────────────────────── Coupure des mots ─────────────────────────

const VOWELS = 'aeiouyàâäéèêëîïôöùûüœæ'
const isVowel = (c: string) => VOWELS.includes(c.toLowerCase())
const KEEP_TOGETHER = new Set(['ch', 'ph', 'th', 'gn', 'sh', 'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tr', 'vr'])

/** Où l'on peut couper un mot avec un trait d'union (règle simple du français : avant une consonne suivie d'une voyelle ; au moins 2 lettres de chaque côté). */
export function hyphenPoints(word: string): number[] {
  const core = word.match(/^\p{L}+/u)?.[0] ?? ''
  if (core.length < 5) return []
  const out = new Set<number>()
  for (let k = 2; k <= core.length - 2; k++) {
    if (isVowel(core[k]) || !isVowel(core[k + 1] ?? 'x')) continue
    let at = k
    if (!isVowel(core[k - 1]) && KEEP_TOGETHER.has((core[k - 1] + core[k]).toLowerCase())) at = k - 1
    if (at >= 2 && at <= core.length - 2) out.add(at)
  }
  return [...out].sort((a, b) => a - b)
}

/** Le plus loin possible où couper le mot pour que le début (+ trait d'union) tienne ; 0 si on ne peut pas. */
function hyphenCut(word: string, fits: (head: string) => boolean): number {
  const points = hyphenPoints(word)
  for (let i = points.length - 1; i >= 0; i--) if (fits(word.slice(0, points[i]))) return points[i]
  return 0
}

/**
 * Coupe un paragraphe en lignes : on casse aux espaces, et au milieu d'un mot s'il est plus large que la boîte.
 * `firstWidth` : largeur de la première ligne (retrait de première ligne) ; `hyphenate` : couper les longs mots avec un trait d'union.
 */
export function wrapLines(paragraph: string, maxWidth: number, measure: Measure, firstWidth = maxWidth, hyphenate = false): string[] {
  if (paragraph === '') return ['']
  const lines: string[] = []
  let line = ''
  const widthNow = () => (lines.length === 0 ? firstWidth : maxWidth)
  const queue = paragraph.split(' ')
  while (queue.length > 0) {
    const word = queue.shift() as string
    const tryLine = line === '' ? word : `${line} ${word}`
    if (measure(tryLine) <= widthNow()) {
      line = tryLine
      continue
    }
    if (hyphenate && line !== '') {
      const cut = hyphenCut(word, (head) => measure(`${line} ${head}-`) <= widthNow())
      if (cut > 0) {
        lines.push(`${line} ${word.slice(0, cut)}-`)
        line = ''
        queue.unshift(word.slice(cut))
        continue
      }
    }
    if (line !== '') {
      lines.push(line)
      line = ''
    }
    if (measure(word) <= widthNow()) {
      line = word
      continue
    }
    if (hyphenate) {
      const cut = hyphenCut(word, (head) => measure(`${head}-`) <= widthNow())
      if (cut > 0) {
        lines.push(`${word.slice(0, cut)}-`)
        queue.unshift(word.slice(cut))
        continue
      }
    }
    // un mot plus large que la boîte : on le coupe lettre par lettre
    let chunk = ''
    for (const ch of word) {
      if (chunk !== '' && measure(chunk + ch) > widthNow()) {
        lines.push(chunk)
        chunk = ch
      } else chunk += ch
    }
    line = chunk
  }
  lines.push(line)
  return lines
}

// ───────────────────────── Paragraphes ─────────────────────────

export interface ParaStyle {
  align: 'left' | 'center' | 'right' | 'justify'
  /** Retraits et espaces, en points. */
  indL: number
  indR: number
  indF: number
  spB: number
  spA: number
  hyph: boolean
  list: 'none' | 'bullet' | 'number'
}

export const paraStyleOf = (it: BoardItem): ParaStyle => ({
  align: it.align ?? 'left', indL: it.indL ?? 0, indR: it.indR ?? 0, indF: it.indF ?? 0, spB: it.spB ?? 0, spA: it.spA ?? 0, hyph: !!it.hyph, list: it.list ?? 'none',
})

/** Largeur réservée à la puce ou au numéro d'une liste. */
export const listGap = (size: number) => size * 1.2

export interface ParaLine {
  text: string
  /** Marge à gauche et à droite de cette ligne. */
  left: number
  right: number
  /** Dernière ligne du paragraphe (elle n'est pas justifiée). */
  last: boolean
}

export interface ParaLayout {
  lines: ParaLine[]
  /** Espace au-dessus et en dessous (nul pour le premier et le dernier paragraphe). */
  before: number
  after: number
  /** Puce ou numéro, posé à `markerLeft`. */
  marker?: string
  markerLeft: number
}

/** Le texte tel qu'on l'affiche (majuscules si demandé). */
export const shownText = (text: string, caps: Caps) => (caps === 'all' ? text.toUpperCase() : text)

/** Les paragraphes mis en page : lignes, retraits, espaces, puces. */
export function layoutParas(it: BoardItem, measure: Measure): ParaLayout[] {
  const st = textStyleOf(it)
  const ps = paraStyleOf(it)
  const point = isPointText(it)
  const paragraphs = shownText(it.text ?? '', st.caps).split('\n')
  const innerW = Math.max(MIN_TEXT_WIDTH, (it.w - TEXT_PAD * 2) / st.sx)
  const gap = listGap(st.size)
  const isList = ps.list !== 'none'
  return paragraphs.map((text, idx) => {
    const textLeft = Math.max(0, ps.indL) + (isList ? gap : 0)
    const firstLeft = isList ? textLeft : Math.max(0, textLeft + ps.indF)
    const right = Math.max(0, ps.indR)
    const rest = Math.max(MIN_TEXT_WIDTH, innerW - textLeft - right)
    const first = Math.max(MIN_TEXT_WIDTH, innerW - firstLeft - right)
    const texts = point ? [text] : wrapLines(text, rest, measure, first, ps.hyph)
    return {
      lines: texts.map((t, i) => ({ text: t, left: i === 0 ? firstLeft : textLeft, right, last: i === texts.length - 1 })),
      before: idx === 0 ? 0 : Math.max(0, ps.spB),
      after: idx === paragraphs.length - 1 ? 0 : Math.max(0, ps.spA),
      marker: isList ? (ps.list === 'bullet' ? '•' : `${idx + 1}.`) : undefined,
      markerLeft: Math.max(0, ps.indL),
    }
  })
}

/** Les lignes affichées d'un texte : tous les paragraphes (séparés par Entrée), coupés selon la largeur pour une zone de texte. */
export function layoutLines(it: BoardItem, measure: Measure): string[] {
  return layoutParas(it, measure).flatMap((p) => p.lines.map((l) => l.text))
}

/** La taille que doit avoir la boîte : un texte de point épouse son texte ; une zone de texte garde sa largeur et ajuste sa hauteur. */
export function measureTextBox(it: BoardItem, measure: Measure): { w: number; h: number } {
  const st = textStyleOf(it)
  const paras = layoutParas(it, measure)
  const lineH = st.size * st.lh
  let h = 0
  for (const p of paras) h += p.before + p.lines.length * lineH + p.after
  h = Math.max(lineH, h) * st.sy + TEXT_PAD * 2
  if (!isPointText(it)) return { w: Math.max(MIN_TEXT_WIDTH, it.w), h }
  const widest = Math.max(0, ...paras.flatMap((p) => p.lines.map((l) => l.left + measure(l.text) + l.right)))
  return { w: Math.max(widest * st.sx, st.size * 0.6) + TEXT_PAD * 2, h }
}

/** Remet la boîte du texte à la bonne taille (après une frappe, un changement de police, un redimensionnement…). */
export function fitText(it: BoardItem, measure: Measure): BoardItem {
  if (it.kind !== 'text') return it
  const { w, h } = measureTextBox(it, measure)
  return w === it.w && h === it.h ? it : { ...it, w, h }
}

/**
 * Après un agrandissement de la sélection : les textes de point grandissent avec (leurs lettres changent de taille, comme dans Illustrator) ;
 * une zone de texte garde la taille de ses lettres et change seulement de largeur (la hauteur est refaite par `fitText`).
 */
export function scaleTexts(scaled: BoardItem[], original: BoardItem[], ids: ReadonlySet<string>, fx: number, fy: number): BoardItem[] {
  const before = new Map(original.map((i) => [i.id, i]))
  const f = (fx + fy) / 2
  return scaled.map((it) => {
    const was = before.get(it.id)
    if (!was || !ids.has(it.id) || it.kind !== 'text' || !isPointText(was)) return it
    return { ...it, size: Math.min(600, Math.max(6, Math.round((was.size ?? 32) * f * 10) / 10)) }
  })
}
