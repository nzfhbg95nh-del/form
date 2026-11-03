import { describe, expect, it } from 'vitest'
import { HINT_LEARNED_AFTER, hintLearned, isTyping, parseTyped } from './editorHint'

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods })

describe('aide des lignes vides', () => {
  it('disparaît dès la première lettre tapée', () => {
    expect(hintLearned(0)).toBe(false)
    expect(hintLearned(HINT_LEARNED_AFTER - 1)).toBe(false)
    expect(hintLearned(HINT_LEARNED_AFTER)).toBe(true)
  })
  it('seules les lettres tapées comptent, pas les raccourcis ni les flèches', () => {
    expect(isTyping(key('a'))).toBe(true)
    expect(isTyping(key(' '))).toBe(true)
    expect(isTyping(key('c', { ctrlKey: true }))).toBe(false)
    expect(isTyping(key('ArrowDown'))).toBe(false)
    expect(isTyping(key('Enter'))).toBe(false)
  })
  it('relit un total abîmé comme zéro', () => {
    expect(parseTyped('42')).toBe(42)
    expect(parseTyped(null)).toBe(0)
    expect(parseTyped('abc')).toBe(0)
    expect(parseTyped('-3')).toBe(0)
  })
})
