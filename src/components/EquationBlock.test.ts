import { describe, expect, it } from 'vitest'
import { renderLatex } from './EquationBlock'

describe('équation LaTeX', () => {
  it('affiche une formule correcte', () => {
    const r = renderLatex(String.raw`\frac{a}{b} + \sqrt{x^2 + 1}`)
    expect(r.error).toBeNull()
    expect(r.html).toContain('katex')
  })
  it('rend un message clair pour une formule incorrecte', () => {
    const r = renderLatex(String.raw`\frac{a`)
    expect(r.html).toBeNull()
    expect(r.error).toBeTruthy()
  })
})
