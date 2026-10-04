import { describe, expect, it } from 'vitest'
import { displayTitle, lastEditText } from './lastEdit'

const now = new Date(2026, 9, 5, 15, 0, 0)

describe('dernière modification', () => {
  it('parle de façon naturelle', () => {
    expect(lastEditText(new Date(2026, 9, 5, 14, 59, 40).toISOString(), now)).toBe('à l’instant')
    expect(lastEditText(new Date(2026, 9, 5, 14, 45, 0).toISOString(), now)).toBe('il y a 15 min')
    expect(lastEditText(new Date(2026, 9, 5, 9, 5, 0).toISOString(), now)).toBe('aujourd’hui à 09:05')
    expect(lastEditText(new Date(2026, 9, 4, 0, 53, 0).toISOString(), now)).toBe('hier à 00:53')
    expect(lastEditText(new Date(2026, 8, 1, 10, 0, 0).toISOString(), now)).toContain('2026')
    expect(lastEditText('nimporte quoi', now)).toBe('')
  })

  it('appelle « Nouvelle page » une page sans titre', () => {
    expect(displayTitle('')).toBe('Nouvelle page')
    expect(displayTitle('   ')).toBe('Nouvelle page')
    expect(displayTitle(null)).toBe('Nouvelle page')
    expect(displayTitle('Devis Dupont')).toBe('Devis Dupont')
  })
})
