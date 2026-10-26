import { afterEach, describe, expect, it } from 'vitest'
import { answerConfirm, askConfirm, confirmStyle, useConfirm } from './confirm'

afterEach(() => answerConfirm(false))

describe('confirmStyle', () => {
  it('une suppression est dangereuse et le bouton porte son nom', () => {
    expect(confirmStyle('Supprimer ce brouillon ?')).toEqual({ danger: true, label: 'Supprimer' })
    expect(confirmStyle('Mettre à la corbeille les 3 recettes ?')).toEqual({ danger: true, label: 'Mettre à la corbeille' })
  })
  it('les autres questions ont un bouton normal', () => {
    expect(confirmStyle('Créer un avoir qui annule cette facture ?')).toEqual({ danger: false, label: 'Confirmer' })
  })
})

describe('askConfirm', () => {
  it('attend la réponse puis ferme la fenêtre', async () => {
    const answer = askConfirm('Supprimer ce client ?')
    expect(useConfirm.getState().pending?.message).toBe('Supprimer ce client ?')
    answerConfirm(true)
    await expect(answer).resolves.toBe(true)
    expect(useConfirm.getState().pending).toBeNull()
  })
  it('« Annuler » répond non', async () => {
    const answer = askConfirm('Envoyer ce devis ?')
    answerConfirm(false)
    await expect(answer).resolves.toBe(false)
  })
  it('une nouvelle question annule la précédente', async () => {
    const first = askConfirm('Première ?')
    const second = askConfirm('Deuxième ?')
    await expect(first).resolves.toBe(false)
    answerConfirm(true)
    await expect(second).resolves.toBe(true)
  })
  it('le texte du bouton peut être choisi', () => {
    void askConfirm('Envoyer ?', { label: 'Envoyer' })
    expect(useConfirm.getState().pending?.label).toBe('Envoyer')
  })
})
