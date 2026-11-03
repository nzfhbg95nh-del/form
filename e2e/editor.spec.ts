import { expect, test } from '@playwright/test'
import { blockTexts, blockTypes, newPage, pasteImage } from './helpers'

test.describe('éditeur façon Notion', () => {
  test('raccourcis de saisie : # , - , [] , > , guillemet, ---', async ({ page }) => {
    await newPage(page, 'Saisie')
    const lines: [string, string][] = [['# T', 'heading'], ['- p', 'bulletListItem'], ['1. n', 'numberedListItem'], ['[] c', 'checkListItem'], ['> d', 'toggleListItem'], ['" q', 'quote']]
    for (const [text] of lines) {
      await page.keyboard.type(text)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter') // une deuxième fois : on sort de la liste
    }
    await page.keyboard.type('---')
    const types = await blockTypes(page)
    for (const [, type] of lines) expect(types).toContain(type)
    expect(types).toContain('divider')
  })

  test('styles en tapant : **gras**, *italique*, `code`, ~barré~', async ({ page }) => {
    await newPage(page, 'Styles')
    await page.keyboard.type('**gras** *ital* `code` ~barre~ ')
    const html = await page.locator('.page-body .bn-inline-content').first().innerHTML()
    expect(html).toMatch(/<strong>gras<\/strong>/)
    expect(html).toMatch(/<em>ital<\/em>/)
    expect(html).toMatch(/<code>code<\/code>/)
    expect(html).toMatch(/<(s|del)>barre<\/(s|del)>/)
  })

  test('Ctrl+Maj+1/4/7, Ctrl+Entrée et Ctrl+Alt+T', async ({ page }) => {
    await newPage(page, 'Raccourcis')
    await page.keyboard.type('Un bloc')
    await page.keyboard.press('Control+Shift+1')
    expect(await blockTypes(page)).toContain('heading')
    await page.keyboard.press('Control+Shift+4')
    expect(await blockTypes(page)).toContain('checkListItem')
    await page.keyboard.press('Control+Enter')
    await expect(page.locator('.bn-block-content[data-content-type="checkListItem"] input[type="checkbox"]')).toBeChecked()
    await page.keyboard.press('Control+Shift+7')
    const wrapper = page.locator('.page-body [data-show-children]').first()
    await expect(wrapper).toHaveAttribute('data-show-children', 'false')
    await page.keyboard.press('Control+Enter')
    await expect(wrapper).toHaveAttribute('data-show-children', 'true')
    await page.keyboard.press('Control+Alt+t')
    await expect(wrapper).toHaveAttribute('data-show-children', 'false')
  })

  test('Ctrl+D duplique le bloc, pas la page', async ({ page }) => {
    await newPage(page, 'Dupli')
    await page.keyboard.type('une ligne')
    await page.waitForTimeout(1000) // le titre est enregistré (et la page apparaît dans la liste) un instant après
    const before = await page.locator('aside').getByRole('button', { name: 'Dupli' }).count()
    await page.keyboard.press('Control+d')
    expect(await blockTexts(page)).toEqual(['une ligne', 'une ligne'])
    await page.waitForTimeout(500)
    expect(await page.locator('aside').getByRole('button', { name: 'Dupli' }).count()).toBe(before) // aucune page en plus
  })

  test('sélection de blocs : Échap, Maj+↓, Suppr', async ({ page }) => {
    await newPage(page, 'Selection')
    for (const t of ['un', 'deux', 'trois']) {
      await page.keyboard.type(t)
      await page.keyboard.press('Enter')
    }
    await page.locator('.page-body .bn-block-content', { hasText: 'deux' }).click()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Delete')
    expect((await blockTexts(page)).filter(Boolean)).toEqual(['un'])
  })

  test('Ctrl+A deux fois sélectionne tous les blocs, Suppr efface tout', async ({ page }) => {
    await newPage(page, 'Tout')
    for (const t of ['un', 'deux']) {
      await page.keyboard.type(t)
      await page.keyboard.press('Enter')
    }
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Delete')
    expect((await blockTexts(page)).filter(Boolean)).toEqual([])
  })

  test('images : collées, rangées en grille (G), supprimées au clavier', async ({ page }) => {
    await newPage(page, 'Images')
    await pasteImage(page, '#cc3333')
    await pasteImage(page, '#33aa33')
    await pasteImage(page, '#3333cc')
    await expect(page.locator('.bn-block-content[data-content-type="image"] img')).toHaveCount(3)
    const imgs = page.locator('.bn-block-content[data-content-type="image"] img')
    await imgs.first().click()
    await imgs.last().click({ modifiers: ['Shift'] })
    await page.keyboard.press('g')
    await expect(page.locator('.bn-block-column-list')).toHaveCount(1)
    await expect(page.locator('.bn-block-column')).toHaveCount(3)
    await imgs.nth(1).click()
    await page.keyboard.press('Delete')
    await expect(page.locator('.bn-block-content[data-content-type="image"] img')).toHaveCount(2)
  })

  test('« Ajouter une image » sous une grille : les nouvelles images rejoignent la grille', async ({ page }) => {
    await newPage(page, 'Grille')
    await pasteImage(page, '#cc3333')
    await pasteImage(page, '#33aa33')
    const imgs = page.locator('.bn-block-content[data-content-type="image"] img')
    await imgs.first().click()
    await imgs.last().click({ modifiers: ['Shift'] })
    await page.keyboard.press('g')
    await expect(page.locator('.bn-block-column')).toHaveCount(2)
    await page.locator('.bn-block-column-list').hover()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Ajouter une image', exact: true }).click()])
    await chooser.setFiles([{ name: 'a.png', mimeType: 'image/png', buffer: png }, { name: 'b.png', mimeType: 'image/png', buffer: png }])
    await expect(imgs).toHaveCount(4)
    await expect(page.locator('.bn-block-column')).toHaveCount(3) // 4 images : 3 colonnes
  })

  test('glisser une image sur une page de la barre latérale l’y déplace', async ({ page }) => {
    await newPage(page, 'Depart')
    await pasteImage(page, '#cc3333')
    await page.waitForTimeout(800)
    await page.locator('aside').getByRole('button', { name: 'Nouvelle page', exact: true }).last().click()
    await page.keyboard.type('Arrivee')
    await page.waitForTimeout(800)
    await page.locator('aside').getByRole('button', { name: 'Depart' }).first().click()
    const img = page.locator('.bn-block-content[data-content-type="image"] img')
    await expect(img).toHaveCount(1)
    await img.hover() // l'image devient « glissable » au survol
    // On dépose sur la ligne de la liste « Pages » (la dernière : « Récentes » vient avant)
    await img.dragTo(page.locator('aside').getByRole('button', { name: 'Arrivee' }).last())
    await expect(page.getByText('Bloc déplacé vers « Arrivee »')).toBeVisible()
    await expect(img).toHaveCount(0)
    await page.locator('aside').getByRole('button', { name: 'Arrivee' }).first().click()
    await expect(page.locator('.bn-block-content[data-content-type="image"] img')).toHaveCount(1)
  })
})