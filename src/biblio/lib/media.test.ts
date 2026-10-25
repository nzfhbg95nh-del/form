import { describe, expect, it } from 'vitest'
import { formatDate, originalPath, thumbPath } from './media.ts'

describe('chemins', () => {
  it('assemble le dossier et le chemin relatif au format Windows', () => {
    expect(originalPath('C:\\Social Saver\\Save images', 'pinterest/DYSARTADD/3D & CGI/1.jpg')).toBe('C:\\Social Saver\\Save images\\pinterest\\DYSARTADD\\3D & CGI\\1.jpg')
  })
  it('tolère une barre finale dans le dossier', () => {
    expect(originalPath('C:\\x\\', 'a/b.jpg')).toBe('C:\\x\\a\\b.jpg')
    expect(thumbPath('C:\\t/', 'ab/cd.jpg')).toBe('C:\\t\\ab\\cd.jpg')
  })
})

describe('formatDate', () => {
  it('écrit la date en français, sans décalage de fuseau', () => {
    expect(formatDate('2026-09-21')).toBe('21 septembre 2026')
    expect(formatDate('2026-01-01')).toBe('1 janvier 2026')
  })
  it('rend vide une date absente ou invalide', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate('nimporte')).toBe('')
  })
})
