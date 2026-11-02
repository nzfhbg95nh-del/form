import { describe, expect, it } from 'vitest'
import { parseTextSize, TEXT_SIZES } from './uiPrefs'

describe('taille du texte', () => {
  it('reconnaît les tailles proposées et revient à « normal » sinon', () => {
    for (const s of TEXT_SIZES) expect(parseTextSize(s.id)).toBe(s.id)
    expect(parseTextSize(null)).toBe('normal')
    expect(parseTextSize('énorme')).toBe('normal')
  })

  it('« normal » correspond à la taille de base du navigateur (16 px)', () => {
    expect(TEXT_SIZES.find((s) => s.id === 'normal')!.px).toBe(16)
  })
})
