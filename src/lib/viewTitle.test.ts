import { describe, expect, it } from 'vitest'
import { viewTitle } from './viewTitle'

describe('viewTitle', () => {
  it('donne le nom des écrans', () => {
    expect(viewTitle('home')).toBe('Accueil')
    expect(viewTitle('quotes')).toBe('Devis')
    expect(viewTitle('services')).toBe('Tarifs')
    expect(viewTitle('settings')).toBe('Réglages')
  })
  it('pour la bibliothèque, donne la page ouverte, ou le tableau ouvert dans « Tout »', () => {
    expect(viewTitle('library', 'moodboards')).toBe('Moodboards')
    expect(viewTitle('library', 'map')).toBe('Carte')
    expect(viewTitle('library', 'all')).toBe('Tout')
    expect(viewTitle('library', 'all', 'Art graphic')).toBe('Art graphic')
    expect(viewTitle('library', 'collections', 'Art graphic')).toBe('Collections')
  })
  it('un écran inconnu garde un nom neutre', () => {
    expect(viewTitle('autre')).toBe('Form')
  })
})
