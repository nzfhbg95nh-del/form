import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_STYLE, exportFileName, parsePageStyle, withPageStyle } from './pageStyle'

describe('réglages de page', () => {
  it('lit des valeurs par défaut quand il n\'y a rien ou que c\'est abîmé', () => {
    expect(parsePageStyle(null)).toEqual(DEFAULT_PAGE_STYLE)
    expect(parsePageStyle('pas du json')).toEqual(DEFAULT_PAGE_STYLE)
    expect(parsePageStyle('[1,2]')).toEqual(DEFAULT_PAGE_STYLE)
    expect(parsePageStyle(JSON.stringify({ ui: { font: 'comic', wide: 'oui' } }))).toEqual(DEFAULT_PAGE_STYLE)
  })

  it('enregistre un réglage sans toucher aux autres propriétés', () => {
    const props = JSON.stringify({ title: 'x', ui: { wide: true } })
    const next = withPageStyle(props, { font: 'serif' })
    expect(JSON.parse(next).title).toBe('x')
    expect(parsePageStyle(next)).toEqual({ font: 'serif', small: false, wide: true, locked: false })
  })

  it('retire la clé quand tout revient aux valeurs par défaut', () => {
    const next = withPageStyle(JSON.stringify({ a: 1, ui: { wide: true } }), { wide: false })
    expect(JSON.parse(next)).toEqual({ a: 1 })
    expect(withPageStyle(null, { locked: true })).toContain('"locked":true')
  })
})

describe("nom de fichier d'export", () => {
  it('retire les caractères interdits sous Windows', () => {
    expect(exportFileName('Devis: Dupont/Martin ?', 'md')).toBe('Devis Dupont Martin.md')
    expect(exportFileName('   ', 'md')).toBe('Sans titre.md')
  })
})
