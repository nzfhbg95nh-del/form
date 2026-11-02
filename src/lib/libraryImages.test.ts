import { describe, expect, it } from 'vitest'
import { countDataImages, isLibraryUrl, libraryRel, parseDataImage, toLibraryUrl } from './libraryImages'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

describe('adresses de la bibliothèque', () => {
  it('reconnaît et lit une adresse form-lib', () => {
    expect(isLibraryUrl('form-lib:recettes/a.jpg')).toBe(true)
    expect(isLibraryUrl('https://x.fr/a.jpg')).toBe(false)
    expect(isLibraryUrl(null)).toBe(false)
    expect(libraryRel('form-lib:recettes/a.jpg')).toBe('recettes/a.jpg')
    expect(toLibraryUrl('recettes/a.jpg')).toBe('form-lib:recettes/a.jpg')
  })

  it('refuse tout chemin qui sortirait du dossier', () => {
    for (const bad of ['form-lib:', 'form-lib:/etc/passwd', 'form-lib:\\Windows\\x', 'form-lib:C:/Windows/x.dll', 'form-lib:../secret.jpg', 'form-lib:recettes/../../x.jpg', 'form-lib:recettes//a.jpg']) {
      expect(libraryRel(bad), bad).toBeNull()
    }
    expect(libraryRel('https://x.fr/a.jpg')).toBeNull()
  })
})

describe('images intégrées à une page', () => {
  it('lit le format et le contenu', () => {
    expect(parseDataImage(PNG)).toEqual({ mime: 'image/png', ext: 'png', base64: 'iVBORw0KGgo=' })
    expect(parseDataImage(JPG)?.ext).toBe('jpg')
    expect(parseDataImage('data:image/webp;base64,AAAA')?.ext).toBe('webp')
  })

  it('ignore ce qui n\'est pas une image rangeable', () => {
    expect(parseDataImage('data:image/svg+xml;base64,AAAA')).toBeNull()
    expect(parseDataImage('data:text/plain;base64,AAAA')).toBeNull()
    expect(parseDataImage('https://x.fr/a.png')).toBeNull()
    expect(parseDataImage('form-lib:recettes/a.png')).toBeNull()
    expect(parseDataImage(undefined)).toBeNull()
    expect(parseDataImage(42)).toBeNull()
  })

  it('compte les photos et leur poids, y compris dans les blocs imbriqués', () => {
    const blocks = [
      { type: 'image', props: { url: PNG } },
      { type: 'paragraph', content: 'x', children: [{ type: 'image', props: { url: JPG } }] },
      { type: 'image', props: { url: 'https://x.fr/a.png' } },
      { type: 'image', props: { url: 'form-lib:recettes/deja.jpg' } },
    ]
    const r = countDataImages(blocks)
    expect(r.count).toBe(2)
    expect(r.bytes).toBe(8 + 10)
  })
})
