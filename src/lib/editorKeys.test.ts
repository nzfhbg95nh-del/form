import { describe, expect, it } from 'vitest'
import { EMPTY_LINE_HINT } from './editorKeys'

describe('éditeur de pages', () => {
  it("l'aide d'une ligne vide dit qu'on peut écrire des notes ici", () => {
    expect(EMPTY_LINE_HINT).toBe('Écris tes notes ici…')
  })
})
