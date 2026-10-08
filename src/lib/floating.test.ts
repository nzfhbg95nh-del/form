import { describe, expect, it } from 'vitest'
import { floatingBoardId, floatingLabel, floatingUrl } from './floating'

describe('fenêtre flottante du moodboard', () => {
  it('lit l’identifiant du moodboard dans l’adresse, seulement s’il est sûr', () => {
    expect(floatingBoardId('?board=abc-123_X')).toBe('abc-123_X')
    expect(floatingBoardId('')).toBeNull()
    expect(floatingBoardId('?board=')).toBeNull()
    expect(floatingBoardId('?board=../etc')).toBeNull()
    expect(floatingBoardId('?board=a b')).toBeNull()
    expect(floatingBoardId(`?board=${'x'.repeat(65)}`)).toBeNull()
  })

  it('fabrique un nom de fenêtre et une adresse', () => {
    expect(floatingLabel('5f3c-ab12')).toBe('board-5f3c-ab12')
    expect(floatingLabel('a/b c')).toBe('board-abc')
    expect(floatingUrl('5f3c-ab12')).toBe('index.html?board=5f3c-ab12')
  })
})
