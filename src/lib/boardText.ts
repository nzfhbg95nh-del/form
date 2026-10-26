// Le texte du moodboard, comme dans Illustrator : un « texte de point » (un clic) s'agrandit en tapant, sans retour à la ligne automatique ;
// une « zone de texte » (un glisser) a une largeur fixe et revient à la ligne toute seule. Ici, la logique « pure » : mesure, retour à la ligne,
// ajustement de la boîte et redimensionnement. Le calcul de la largeur d'un texte est donné par l'appelant (`measure`), pour être testé sans écran.

import type { BoardItem } from './moodboard'

export const FONTS = ['Segoe UI', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact', 'Comic Sans MS']
export const DEFAULT_FONT = FONTS[0]
/** Marge autour du texte, dans la boîte. */
export const TEXT_PAD = 2
export const MIN_TEXT_WIDTH = 24

export interface TextStyle {
  font: string
  size: number
  bold: boolean
  italic: boolean
  /** Espacement des lettres, en fraction de la taille (0 = normal). */
  ls: number
  /** Interlignage : hauteur d'une ligne, en fraction de la taille. */
  lh: number
}

export const textStyleOf = (it: BoardItem): TextStyle => ({
  font: it.font ?? DEFAULT_FONT, size: it.size ?? 32, bold: !!it.bold, italic: !!it.italic, ls: it.ls ?? 0, lh: it.lh ?? 1.2,
})

/** La police au format de l'écran (pour mesurer et pour dessiner). */
export const cssFont = (st: Pick<TextStyle, 'font' | 'size' | 'bold' | 'italic'>) => `${st.italic ? 'italic ' : ''}${st.bold ? 700 : 400} ${st.size}px "${st.font}", sans-serif`

/** Un texte de point : sans retour à la ligne automatique (tout texte qui n'est pas une zone de texte, y compris les anciens). */
export const isPointText = (it: BoardItem) => it.kind === 'text' && it.auto !== false

export type Measure = (text: string) => number

/** Coupe un paragraphe en lignes qui tiennent dans `maxWidth` : on casse aux espaces, et au milieu d'un mot s'il est plus large que la boîte. */
export function wrapLines(paragraph: string, maxWidth: number, measure: Measure): string[] {
  if (paragraph === '') return ['']
  const lines: string[] = []
  let line = ''
  const push = (word: string) => {
    const tryLine = line === '' ? word : `${line} ${word}`
    if (measure(tryLine) <= maxWidth || line === '' && measure(word) <= maxWidth) {
      line = tryLine
      return
    }
    if (line !== '') {
      lines.push(line)
      line = ''
    }
    if (measure(word) <= maxWidth) {
      line = word
      return
    }
    // un mot plus large que la boîte : on le coupe lettre par lettre
    let chunk = ''
    for (const ch of word) {
      if (chunk !== '' && measure(chunk + ch) > maxWidth) {
        lines.push(chunk)
        chunk = ch
      } else chunk += ch
    }
    line = chunk
  }
  for (const word of paragraph.split(' ')) push(word)
  lines.push(line)
  return lines
}

/** Les lignes affichées d'un texte : tous les paragraphes (séparés par Entrée), coupés selon la largeur pour une zone de texte. */
export function layoutLines(it: BoardItem, measure: Measure): string[] {
  const paragraphs = (it.text ?? '').split('\n')
  if (isPointText(it)) return paragraphs
  const inner = Math.max(MIN_TEXT_WIDTH, it.w - TEXT_PAD * 2)
  return paragraphs.flatMap((p) => wrapLines(p, inner, measure))
}

/** La taille que doit avoir la boîte : un texte de point épouse son texte ; une zone de texte garde sa largeur et ajuste sa hauteur. */
export function measureTextBox(it: BoardItem, measure: Measure): { w: number; h: number } {
  const st = textStyleOf(it)
  const lines = layoutLines(it, measure)
  const h = Math.max(1, lines.length) * st.size * st.lh + TEXT_PAD * 2
  if (!isPointText(it)) return { w: Math.max(MIN_TEXT_WIDTH, it.w), h }
  const widest = Math.max(0, ...lines.map((l) => measure(l)))
  return { w: Math.max(widest, st.size * 0.6) + TEXT_PAD * 2, h }
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
