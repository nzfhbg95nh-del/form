import { describe, expect, it } from 'vitest'
import { csvRecords, parseCsv } from './csv'
import {
  buildPlan, cleanRelation, convertNotionHtml, imageRefs, inferColumn, normalizePath, parseName, parseNotionDate, resolveAsset,
  stripCommonRoot, stripPageHeader, type NotionFile,
} from './notion'

const enc = new TextEncoder()
const A = 'a'.repeat(32)
const B = 'b'.repeat(32)
const C = 'c'.repeat(32)
const D = 'd'.repeat(32)
const E = 'e'.repeat(32)
const F = 'f'.repeat(32)

const csv = [
  'Name,Tags,Date,Prix,Fait,Lien',
  'Tarte aux pommes,"Dessert, Facile",4 octobre 2026,12,Yes,https://exemple.fr/tarte',
  'Gratin,Plat,5 octobre 2026,8,No,https://exemple.fr/gratin',
  'Soupe,Plat,,5,Yes,https://exemple.fr/soupe',
  'Quiche,Plat,"6 octobre 2026 → 7 octobre 2026",9,No,',
].join('\n')

const file = (path: string, text: string | Uint8Array = ''): NotionFile => ({ path, data: typeof text === 'string' ? enc.encode(text) : text })

const exportFiles = (): NotionFile[] => {
  const root = `Export-xyz/Mon Notion ${A}`
  const graille = `${root}/La graille ${B}`
  return [
    file(`Export-xyz/Mon Notion ${A}.md`, '# Mon Notion\n\nBienvenue'),
    file(`${root}/La graille ${B}.md`, '# La graille\n\nMes recettes'),
    file(`${graille}/Recettes ${C}.csv`, 'Name,Tags\nTarte aux pommes,Dessert'),
    file(`${graille}/Recettes ${C}_all.csv`, csv),
    file(`${graille}/Recettes ${C}/Tarte aux pommes ${D}.md`, '# Tarte aux pommes\n\nTags: Dessert, Facile\nDate: 4 octobre 2026\n\n## Ingrédients\n- 4 pommes\n\n![photo](Tarte%20aux%20pommes%20' + D + '/photo.png)'),
    file(`${graille}/Recettes ${C}/Tarte aux pommes ${D}/photo.png`, new Uint8Array([1, 2, 3])),
    file(`${graille}/Recettes ${C}/Gratin ${E}.md`, '# Gratin\n\nPlat: oui\n\nPomme de terre'),
    file(`Export-xyz/Voyage ${F}.md`, '# Voyage\n'),
    file('Export-xyz/.DS_Store', 'x'),
  ]
}

describe('lecture du CSV', () => {
  it('gère guillemets, virgules, retours à la ligne et BOM', () => {
    const rows = parseCsv('﻿A,B\r\n"un, deux","ligne1\nligne2"\n"cite ""ça""",x\n')
    expect(rows).toEqual([['A', 'B'], ['un, deux', 'ligne1\nligne2'], ['cite "ça"', 'x']])
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseCsv('')).toEqual([])
  })

  it('renvoie des enregistrements par en-tête', () => {
    expect(csvRecords('Nom,Age\nMarie,30\nPaul')).toEqual({ headers: ['Nom', 'Age'], records: [{ Nom: 'Marie', Age: '30' }, { Nom: 'Paul', Age: '' }] })
  })
})

describe('noms, chemins, dates', () => {
  it('sépare titre, identifiant et extension', () => {
    expect(parseName(`La graille ${B}.md`)).toEqual({ title: 'La graille', id: B, ext: 'md', all: false })
    expect(parseName(`Recettes ${C}_all.csv`)).toEqual({ title: 'Recettes', id: C, ext: 'csv', all: true })
    expect(parseName('photo.png')).toEqual({ title: 'photo', id: null, ext: 'png', all: false })
  })

  it('retire le dossier commun et les fichiers parasites, sauf si une page porte ce nom', () => {
    expect(stripCommonRoot(['Export/a.md', 'Export/b/c.md'])).toEqual(['a.md', 'b/c.md'])
    expect(stripCommonRoot(['Export/a.md', 'Export.md'])).toEqual(['Export/a.md', 'Export.md'])
    expect(stripCommonRoot(['a.md', 'b/c.md'])).toEqual(['a.md', 'b/c.md'])
    expect(normalizePath('.\\dossier\\fichier.md')).toBe('dossier/fichier.md')
  })

  it('retrouve une image citée dans une page', () => {
    expect(resolveAsset('A/La graille B/Page C.md', 'Page%20C/photo%20un.png')).toBe('A/La graille B/Page C/photo un.png')
    expect(resolveAsset('A/B/page.md', '../autre/x.png')).toBe('A/autre/x.png')
    expect(resolveAsset('page.md', 'img.png')).toBe('img.png')
  })

  it('lit les dates françaises et anglaises, et le début d\'une plage', () => {
    expect(parseNotionDate('4 octobre 2026')).toBe('2026-10-04')
    expect(parseNotionDate('1er mars 2027')).toBe('2027-03-01')
    expect(parseNotionDate('October 4, 2026')).toBe('2026-10-04')
    expect(parseNotionDate('2026-10-04')).toBe('2026-10-04')
    expect(parseNotionDate('04/10/2026')).toBe('2026-10-04')
    expect(parseNotionDate('4 octobre 2026 → 9 octobre 2026')).toBe('2026-10-04')
    expect(parseNotionDate('31 février 2026')).toBeNull()
    expect(parseNotionDate('bientôt')).toBeNull()
  })
})

describe('types des colonnes', () => {
  it('devine le type selon les valeurs', () => {
    expect(inferColumn(['Yes', 'No', ''])).toEqual({ type: 'checkbox' })
    expect(inferColumn(['12', '8,5', '1 200'])).toEqual({ type: 'number' })
    expect(inferColumn(['4 octobre 2026', '', 'October 5, 2026'])).toEqual({ type: 'date' })
    expect(inferColumn(['https://a.fr', 'http://b.fr'])).toEqual({ type: 'url' })
    expect(inferColumn(['Plat', 'Dessert', 'Plat', 'Dessert'])).toEqual({ type: 'select', options: ['Plat', 'Dessert'] })
    expect(inferColumn(['A, B', 'A', 'B', 'A, B'])).toEqual({ type: 'multiselect', options: ['A', 'B'] })
    expect(inferColumn(['une note', 'une autre', 'encore une'])).toEqual({ type: 'text' })
    expect(inferColumn(['', ''])).toEqual({ type: 'text' })
  })

  it("nettoie les relations", () => {
    expect(cleanRelation('Ma page (https://www.notion.so/Ma-page-abc123), Autre (https://notion.so/x)')).toBe('Ma page, Autre')
  })
})

describe('préparation du Markdown', () => {
  it("retire le titre, et les propriétés d'une ligne de base", () => {
    const md = '# Tarte\n\nTags: Dessert, Facile\nDate: 4 octobre 2026\n\n## Ingrédients\n- 4 pommes'
    expect(stripPageHeader(md, true)).toBe('## Ingrédients\n- 4 pommes')
    expect(stripPageHeader('# Page\n\nNote : à garder\n\nTexte', false)).toBe('Note : à garder\n\nTexte')
  })

  it('convertit encarts, toggles et colonnes', () => {
    expect(convertNotionHtml('<aside>\n💡 Astuce\n</aside>')).toBe('> 💡 Astuce')
    expect(convertNotionHtml('<details><summary>Titre</summary>\n\nContenu</details>')).toBe('**Titre**\n\n\nContenu'.replace('\n\n\n', '\n\n'))
    expect(convertNotionHtml('a<br>b<div class="column">x</div>')).toBe('a\nbx')
  })

  it('liste les images locales d\'une page', () => {
    expect(imageRefs('![a](dossier/img%201.png) ![b](https://x.fr/y.png) texte ![c](c.jpg "titre")')).toEqual(['dossier/img%201.png', 'c.jpg'])
  })
})

describe("plan d'import d'un export Notion", () => {
  const plan = buildPlan(exportFiles())
  const byTitle = (t: string) => plan.nodes.find((n) => n.title === t)!

  it('reconnaît pages, base de données, lignes et images', () => {
    expect(plan.stats).toEqual({ pages: 3, databases: 1, rows: 4, images: 1 })
    expect(plan.nodes.map((n) => n.kind)).toEqual(expect.arrayContaining(['page', 'database', 'row']))
  })

  it('reconstruit la hiérarchie', () => {
    expect(byTitle('Mon Notion').parentKey).toBeNull()
    expect(byTitle('Voyage').parentKey).toBeNull()
    expect(byTitle('La graille').parentKey).toBe(A)
    expect(byTitle('Recettes').kind).toBe('database')
    expect(byTitle('Recettes').parentKey).toBe(B)
    expect(byTitle('Tarte aux pommes').parentKey).toBe(C)
  })

  it('devine le schéma à partir du CSV complet (_all) et convertit les valeurs', () => {
    const schema = byTitle('Recettes').schema!
    expect(schema.columns.map((c) => [c.name, c.type])).toEqual([
      ['Tags', 'multiselect'], ['Date', 'date'], ['Prix', 'number'], ['Fait', 'checkbox'], ['Lien', 'url'],
    ])
    const col = (n: string) => schema.columns.find((c) => c.name === n)!
    const tarte = byTitle('Tarte aux pommes')
    expect(tarte.mdPath).toContain('Tarte aux pommes')
    expect(tarte.values![col('Prix').id]).toBe(12)
    expect(tarte.values![col('Fait').id]).toBe(true)
    expect(tarte.values![col('Date').id]).toBe('2026-10-04')
    const tags = tarte.values![col('Tags').id] as string[]
    expect(tags.map((id) => col('Tags').options!.find((o) => o.id === id)!.label)).toEqual(['Dessert', 'Facile'])
    expect(byTitle('Quiche').values![col('Date').id]).toBe('2026-10-06')
    expect(byTitle('Soupe').values![col('Date').id]).toBeNull()
  })

  it('rattache les lignes du CSV à leur page, et garde les pages sans ligne', () => {
    const rows = plan.nodes.filter((n) => n.kind === 'row')
    expect(rows.find((r) => r.title === 'Tarte aux pommes')!.key).toBe(D)
    expect(rows.find((r) => r.title === 'Gratin')!.mdPath).toContain('Gratin')
    expect(rows.find((r) => r.title === 'Quiche')!.mdPath).toBeUndefined()
    expect(rows.every((r) => r.parentKey === C)).toBe(true)
  })

  it('prévient de ce qui ne peut pas être importé', () => {
    expect(plan.warnings.join(' ')).toMatch(/vues Notion/)
    expect(plan.warnings.join(' ')).toMatch(/icônes/)
  })

  it("ignore les fichiers parasites et accepte un export sans identifiants", () => {
    const simple = buildPlan([file('Accueil.md', '# Accueil'), file('Accueil/Sous page.md', '# Sous page'), file('__MACOSX/x.md', 'x')])
    expect(simple.nodes.map((n) => [n.title, n.parentKey])).toEqual([['Accueil', null], ['Sous page', 'Accueil.md']])
  })
})
