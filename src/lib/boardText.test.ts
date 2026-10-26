import { describe, expect, it } from 'vitest'
import { cssFont, fitText, hyphenPoints, isPointText, layoutLines, layoutParas, measureTextBox, scaleTexts, TEXT_PAD, wrapLines } from './boardText'
import type { BoardItem } from './moodboard'

/** Chaque lettre mesure 10 unités : on sait compter. */
const measure = (s: string) => s.length * 10
const text = (extra: Partial<BoardItem> = {}): BoardItem => ({ id: 't', kind: 'text', x: 0, y: 0, w: 100, h: 40, text: '', size: 20, ...extra })

describe('wrapLines', () => {
  it('coupe aux espaces quand la ligne est trop longue', () => {
    expect(wrapLines('un deux trois', 70, measure)).toEqual(['un deux', 'trois'])
  })
  it('un paragraphe vide reste une ligne vide', () => {
    expect(wrapLines('', 70, measure)).toEqual([''])
  })
  it('coupe un mot trop long au milieu', () => {
    expect(wrapLines('abcdefghij', 40, measure)).toEqual(['abcd', 'efgh', 'ij'])
  })
  it('garde un mot qui tient pile', () => {
    expect(wrapLines('abcd efgh', 40, measure)).toEqual(['abcd', 'efgh'])
  })
})

describe('texte de point et zone de texte', () => {
  it('un texte sans « auto » compte comme un texte de point (les anciens textes aussi)', () => {
    expect(isPointText(text())).toBe(true)
    expect(isPointText(text({ auto: true }))).toBe(true)
    expect(isPointText(text({ auto: false }))).toBe(false)
  })
  it('un texte de point ne revient pas à la ligne tout seul, seulement avec Entrée', () => {
    expect(layoutLines(text({ text: 'un deux trois quatre' }), measure)).toEqual(['un deux trois quatre'])
    expect(layoutLines(text({ text: 'ligne 1\nligne 2' }), measure)).toEqual(['ligne 1', 'ligne 2'])
  })
  it('une zone de texte revient à la ligne selon sa largeur', () => {
    const lines = layoutLines(text({ text: 'un deux trois', auto: false, w: 70 + TEXT_PAD * 2 }), measure)
    expect(lines).toEqual(['un deux', 'trois'])
  })
})

describe('boîte du texte', () => {
  it('un texte de point épouse son texte (ligne la plus large, nombre de lignes)', () => {
    const { w, h } = measureTextBox(text({ text: 'abc\nabcdef', size: 20, lh: 1.5 }), measure)
    expect(w).toBe(60 + TEXT_PAD * 2)
    expect(h).toBe(2 * 20 * 1.5 + TEXT_PAD * 2)
  })
  it('une zone de texte garde sa largeur et ajuste sa hauteur', () => {
    const it = text({ text: 'un deux trois', auto: false, w: 70 + TEXT_PAD * 2, size: 10, lh: 1 })
    expect(measureTextBox(it, measure)).toEqual({ w: 70 + TEXT_PAD * 2, h: 2 * 10 + TEXT_PAD * 2 })
  })
  it('un texte vide a une taille de départ lisible', () => {
    const { w, h } = measureTextBox(text({ text: '', size: 30 }), measure)
    expect(w).toBeGreaterThan(10)
    expect(h).toBe(30 * 1.2 + TEXT_PAD * 2)
  })
  it('fitText ne change rien si la boîte est déjà bonne, et ignore les autres éléments', () => {
    const fitted = fitText(text({ text: 'abc' }), measure)
    expect(fitText(fitted, measure)).toBe(fitted)
    const note: BoardItem = { id: 'n', kind: 'note', x: 0, y: 0, w: 5, h: 5 }
    expect(fitText(note, measure)).toBe(note)
  })
})

describe('agrandir la sélection', () => {
  const original = [text({ id: 'p', size: 20 }), text({ id: 'z', auto: false, size: 20 }), { id: 'i', kind: 'image', x: 0, y: 0, w: 10, h: 10 } as BoardItem]
  const ids = new Set(['p', 'z', 'i'])
  const scaled = original.map((i) => ({ ...i, w: i.w * 2, h: i.h * 2 }))
  it('les lettres d\'un texte de point grandissent avec la sélection', () => {
    const out = scaleTexts(scaled, original, ids, 2, 2)
    expect(out.find((i) => i.id === 'p')?.size).toBe(40)
  })
  it('une zone de texte garde ses lettres', () => {
    expect(scaleTexts(scaled, original, ids, 2, 2).find((i) => i.id === 'z')?.size).toBe(20)
  })
  it('un texte hors de la sélection ne bouge pas', () => {
    expect(scaleTexts(scaled, original, new Set(['i']), 2, 2).find((i) => i.id === 'p')?.size).toBe(20)
  })
})

describe('police', () => {
  it('écrit la police pour l\'écran', () => {
    expect(cssFont({ font: 'Georgia', size: 24, bold: true, italic: true })).toBe('italic 700 24px "Georgia", sans-serif')
    expect(cssFont({ font: 'Arial', size: 12, bold: false, italic: false })).toBe('400 12px "Arial", sans-serif')
  })
})

describe('caractère et paragraphe', () => {
  it('une première ligne en retrait laisse moins de place à la première ligne', () => {
    expect(wrapLines('un deux trois', 70, measure, 40)).toEqual(['un', 'deux', 'trois'])
  })
  it('coupe un long mot avec un trait d’union quand c’est demandé', () => {
    expect(wrapLines('aa bonjour', 60, measure, 60, true)).toEqual(['aa', 'bon-', 'jour'])
    expect(wrapLines('aa bonjour', 60, measure)).toEqual(['aa', 'bonjou', 'r'])
  })
  it('hyphenPoints : pas de coupure dans un mot court, au moins 2 lettres de chaque côté', () => {
    expect(hyphenPoints('chat')).toEqual([])
    const pts = hyphenPoints('information')
    expect(pts.length).toBeGreaterThan(0)
    expect(pts.every((k) => k >= 2 && k <= 'information'.length - 2)).toBe(true)
  })
  it('les retraits réduisent la largeur disponible et décalent les lignes', () => {
    const it = text({ text: 'un deux trois', auto: false, w: 100 + TEXT_PAD * 2, indL: 30, indR: 10 })
    const p = layoutParas(it, measure)[0]
    expect(p.lines.map((l) => l.text)).toEqual(['un', 'deux', 'trois'])
    expect(p.lines[0].left).toBe(30)
    expect(p.lines[0].right).toBe(10)
  })
  it('une liste à puces décale le texte et met une puce', () => {
    const p = layoutParas(text({ text: 'a\nb', list: 'bullet', size: 10 }), measure)
    expect(p[0].marker).toBe('•')
    expect(p[1].lines[0].left).toBe(12)
    expect(layoutParas(text({ text: 'a\nb', list: 'number' }), measure)[1].marker).toBe('2.')
  })
  it('les espaces entre paragraphes agrandissent la boîte, pas avant le premier ni après le dernier', () => {
    const base = measureTextBox(text({ text: 'a\nb\nc', size: 10, lh: 1 }), measure).h
    const spaced = measureTextBox(text({ text: 'a\nb\nc', size: 10, lh: 1, spB: 4, spA: 6 }), measure).h
    expect(spaced - base).toBe(2 * (4 + 6))
  })
  it('l’échelle change la boîte, les majuscules aussi', () => {
    const plain = measureTextBox(text({ text: 'abc', size: 10, lh: 1 }), measure)
    const wide = measureTextBox(text({ text: 'abc', size: 10, lh: 1, sx: 2, sy: 3 }), measure)
    expect(wide.w - TEXT_PAD * 2).toBe((plain.w - TEXT_PAD * 2) * 2)
    expect(wide.h - TEXT_PAD * 2).toBe((plain.h - TEXT_PAD * 2) * 3)
    expect(layoutLines(text({ text: 'abc', caps: 'all' }), measure)).toEqual(['ABC'])
  })
  it('cssFont : épaisseur, petites capitales et exposant', () => {
    expect(cssFont({ font: 'Arial', size: 20, bold: false, italic: false, weight: 300 })).toBe('300 20px "Arial", sans-serif')
    expect(cssFont({ font: 'Arial', size: 20, bold: false, italic: false, caps: 'small' })).toBe('small-caps 400 20px "Arial", sans-serif')
    expect(cssFont({ font: 'Arial', size: 100, bold: false, italic: false, script: 'sup' })).toBe('400 58px "Arial", sans-serif')
  })
})
