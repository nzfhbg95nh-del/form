import { describe, expect, it } from 'vitest'
import { dateText, dateTimeText } from './dateShortcuts'

describe('raccourcis de date', () => {
  const now = new Date(2026, 9, 27, 14, 5)
  it('donne la date en français, avec hier et demain', () => {
    expect(dateText(now)).toBe('27 octobre 2026')
    expect(dateText(now, 1)).toBe('28 octobre 2026')
    expect(dateText(now, -1)).toBe('26 octobre 2026')
    expect(dateText(new Date(2026, 11, 31), 1)).toBe('1 janvier 2027')
  })
  it('donne la date et l’heure', () => {
    expect(dateTimeText(now)).toBe('27 octobre 2026, 14:05')
  })
})
