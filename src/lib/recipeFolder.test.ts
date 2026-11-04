import { describe, expect, it } from 'vitest'
import { parseRecipeJson, planRecipe, recipeDirName, recipeJsonText, recipeMarkdown, restoreBlocks, utf8ToBase64, firstPhotoUrl, withFirstPhoto } from './recipeFolder'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

describe('nom du dossier d\'une recette', () => {
  it('garde le titre et ajoute un morceau de l\'identifiant', () => {
    expect(recipeDirName('Acuka (tartinade turque)', '2d6ae14c-b1b5-4190')).toBe('Acuka (tartinade turque) [2d6ae14c]')
  })

  it('retire les caractères interdits par Windows et les espaces en trop', () => {
    expect(recipeDirName('Pâtes : sauce « 3/4 » ? <vite> | "bon"', 'abcd1234ef')).toBe('Pâtes sauce « 3 4 » vite bon [abcd1234]')
    expect(recipeDirName('  ...Gâteau...  ', 'a1b2c3d4')).toBe('Gâteau [a1b2c3d4]')
  })

  it('coupe un titre trop long et nomme une recette sans titre', () => {
    const long = recipeDirName('A'.repeat(200), 'a1b2c3d4')
    expect(long).toBe(`${'A'.repeat(60)} [a1b2c3d4]`)
    expect(recipeDirName('', 'a1b2c3d4')).toBe('Recette [a1b2c3d4]')
    expect(recipeDirName('???', '')).toBe('Recette [recette]')
  })
})

const blocks = () => [
  { type: 'image', props: { url: PNG } },
  { type: 'portions', props: { servings: 4 } },
  { type: 'heading', props: { level: 2 }, content: 'Ingrédients' },
  { type: 'checkListItem', content: '200 g de farine' },
  { type: 'paragraph', content: 'Une note', children: [{ type: 'image', props: { url: JPG } }] },
  { type: 'image', props: { url: 'https://x.fr/a.png' } },
]

describe('rangement d\'une recette', () => {
  it('range les photos intégrées dans le dossier de la recette', () => {
    const input = blocks()
    const plan = planRecipe('Acuka', 'abcd1234', input)
    expect(plan.dir).toBe('Acuka [abcd1234]')
    expect(plan.changedDb).toBe(true)
    expect(plan.photos.map((p) => p.name)).toEqual(['photo-1.png', 'photo-2.jpg'])
    expect(plan.photos[0].base64).toBe('iVBORw0KGgo=')
    const db = plan.dbBlocks as { props?: { url?: string }; children?: { props: { url: string } }[] }[]
    expect(db[0].props!.url).toBe('form-lib:recette/Acuka [abcd1234]/photo-1.png')
    expect(db[4].children![0].props.url).toBe('form-lib:recette/Acuka [abcd1234]/photo-2.jpg')
    expect(db[5].props!.url).toBe('https://x.fr/a.png')
    const file = plan.fileBlocks as { props?: { url?: string }; children?: { props: { url: string } }[] }[]
    expect(file[0].props!.url).toBe('photo-1.png')
    expect(file[4].children![0].props.url).toBe('photo-2.jpg')
    expect(input).toEqual(blocks())
  })

  it('ne réécrit rien pour une recette dont les photos sont déjà dans son dossier', () => {
    const done = [{ type: 'image', props: { url: 'form-lib:recette/Acuka [abcd1234]/photo-1.png' } }]
    const plan = planRecipe('Acuka', 'abcd1234', done)
    expect(plan.changedDb).toBe(false)
    expect(plan.photos).toEqual([])
    expect((plan.fileBlocks as { props: { url: string } }[])[0].props.url).toBe('photo-1.png')
    expect(plan.dbBlocks).toEqual(done)
  })

  it('laisse en place une photo rangée ailleurs et les liens', () => {
    const other = [{ type: 'image', props: { url: 'form-lib:recette/Autre [zzzz9999]/photo-1.png' } }]
    const plan = planRecipe('Acuka', 'abcd1234', other)
    expect(plan.changedDb).toBe(false)
    expect(plan.fileBlocks).toEqual(other)
  })
})

describe('recette.md', () => {
  it('écrit la recette en texte simple', () => {
    const plan = planRecipe('Acuka', 'abcd1234', [
      { type: 'portions', props: { servings: 4 } },
      { type: 'heading', props: { level: 2 }, content: 'Ingrédients' },
      { type: 'checkListItem', props: { checked: false }, content: '200 g de farine' },
      { type: 'checkListItem', props: { checked: true }, content: [{ type: 'text', text: '1 ', styles: {} }, { type: 'text', text: 'oignon', styles: { bold: true } }] },
      { type: 'heading', props: { level: 2 }, content: 'Étapes' },
      { type: 'numberedListItem', content: 'Mélanger' },
      { type: 'numberedListItem', content: 'Cuire' },
      { type: 'paragraph', content: 'Servir frais.' },
      { type: 'image', props: { url: PNG } },
    ])
    const md = recipeMarkdown('Acuka', { servings: 4, prep: 25, source: 'https://insta.example/p/1' }, plan.fileBlocks)
    expect(md).toBe(
      [
        '# Acuka',
        '',
        'Pour 4 personnes · Préparation : 25 min · Source : https://insta.example/p/1',
        '',
        '### Ingrédients',
        '',
        '- [ ] 200 g de farine',
        '- [x] 1 oignon',
        '',
        '### Étapes',
        '',
        '1. Mélanger',
        '2. Cuire',
        'Servir frais.',
        '',
        '![photo](photo-1.png)',
        '',
      ].join('\n'),
    )
  })

  it('reste correct sans propriétés ni contenu', () => {
    expect(recipeMarkdown('  ', {}, [])).toBe('# Recette\n')
  })
})

describe('recette.json', () => {
  const recipe = { id: 'abcd1234-0000', title: 'Acuka', icon: '🍳', cover: null, values: { servings: 4, prep: 25 } }

  it('se relit tel qu\'il a été écrit', () => {
    const plan = planRecipe(recipe.title, recipe.id, blocks())
    const parsed = parseRecipeJson(recipeJsonText(recipe, plan.fileBlocks))
    expect(parsed).toEqual({ id: 'abcd1234-0000', title: 'Acuka', icon: '🍳', cover: null, values: { servings: 4, prep: 25 }, content: plan.fileBlocks })
  })

  it('refuse ce qui n\'est pas une recette de Form', () => {
    expect(parseRecipeJson('pas du json')).toEqual({ error: "Ce fichier n'est pas lisible." })
    expect(parseRecipeJson('{"format":"autre"}')).toEqual({ error: "Ce fichier n'est pas une recette de Form." })
    expect(parseRecipeJson(JSON.stringify({ format: 'form-recette', title: '  ' }))).toEqual({ error: 'Cette recette n’a pas de titre.' })
    expect(parseRecipeJson('null')).toEqual({ error: "Ce fichier n'est pas une recette de Form." })
  })

  it('remet l\'adresse du dossier sur les photos (un aller-retour complet)', () => {
    const plan = planRecipe(recipe.title, recipe.id, blocks())
    const back = restoreBlocks(plan.fileBlocks as unknown[], plan.dir)
    expect(back).toEqual(plan.dbBlocks)
  })

  it('ne touche pas aux liens ni aux noms qui ne sont pas des photos de la recette', () => {
    const out = restoreBlocks([{ type: 'image', props: { url: 'https://x.fr/photo-1.png' } }, { type: 'image', props: { url: '../secret.png' } }], 'Acuka [abcd1234]') as { props: { url: string } }[]
    expect(out[0].props.url).toBe('https://x.fr/photo-1.png')
    expect(out[1].props.url).toBe('../secret.png')
  })
})

describe('texte en base64', () => {
  it('garde les accents et les longs textes', () => {
    expect(utf8ToBase64('Crêpes')).toBe('Q3LDqnBlcw==')
    const long = 'é'.repeat(50_000)
    expect(atob(utf8ToBase64(long)).length).toBe(100_000)
  })
})

describe('photo manquante d\'une recette', () => {
  it('lit la première photo, vide si le bloc photo est vide', () => {
    expect(firstPhotoUrl([{ type: 'image' }, { type: 'paragraph' }])).toBe('')
    expect(firstPhotoUrl([{ type: 'image', props: { url: 'photo-1.jpg' } }])).toBe('photo-1.jpg')
    expect(firstPhotoUrl([])).toBe('')
  })
  it('met la photo dans le bloc vide, ou crée le bloc en tête, sans toucher aux blocs reçus', () => {
    const blocks = [{ type: 'image' }, { type: 'portions' }]
    expect(withFirstPhoto(blocks, 'form-lib:a.jpg')[0]).toEqual({ type: 'image', props: { url: 'form-lib:a.jpg' } })
    expect(blocks[0]).toEqual({ type: 'image' })
    expect(withFirstPhoto([{ type: 'portions' }], 'x.jpg')).toEqual([{ type: 'image', props: { url: 'x.jpg' } }, { type: 'portions' }])
  })
})