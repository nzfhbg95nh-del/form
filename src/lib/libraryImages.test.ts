import { describe, expect, it } from 'vitest'
import { countDataImages, isLibraryUrl, libraryRel, moveImagesToLibrary, parseDataImage, toLibraryUrl } from './libraryImages'

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

describe('ranger les photos dans le dossier', () => {
  const blocks = () => [
    { type: 'portions', props: { servings: 4 } },
    { type: 'image', props: { url: PNG, caption: 'ma photo' } },
    { type: 'paragraph', children: [{ type: 'image', props: { url: JPG } }] },
    { type: 'image', props: { url: 'https://x.fr/a.png' } },
  ]

  it('remplace chaque photo par son adresse form-lib, sans modifier les blocs reçus', async () => {
    const input = blocks()
    const seen: string[] = []
    const r = await moveImagesToLibrary(input, async (img) => {
      seen.push(img.ext)
      return `recettes/${img.ext}-${seen.length}.${img.ext}`
    })
    expect(r.moved).toBe(2)
    expect(r.failed).toBe(0)
    expect(seen).toEqual(['png', 'jpg'])
    const out = r.blocks as { props?: { url?: string; caption?: string }; children?: { props: { url: string } }[] }[]
    expect(out[1].props).toEqual({ url: 'form-lib:recettes/png-1.png', caption: 'ma photo' })
    expect(out[2].children![0].props.url).toBe('form-lib:recettes/jpg-2.jpg')
    expect(out[3].props!.url).toBe('https://x.fr/a.png')
    expect(input).toEqual(blocks())
  })

  it('garde la photo telle quelle quand son rangement échoue, et continue', async () => {
    let n = 0
    const r = await moveImagesToLibrary(blocks(), async () => {
      n++
      if (n === 1) throw new Error('disque plein')
      return 'recettes/ok.jpg'
    })
    expect(r.moved).toBe(1)
    expect(r.failed).toBe(1)
    const out = r.blocks as { props?: { url?: string } }[]
    expect(out[1].props!.url).toBe(PNG)
  })

  it('ne fait rien sans photo', async () => {
    const r = await moveImagesToLibrary([{ type: 'paragraph', content: 'texte' }], async () => 'x')
    expect(r).toEqual({ blocks: [{ type: 'paragraph', content: 'texte' }], moved: 0, failed: 0, bytes: 0 })
  })
})
