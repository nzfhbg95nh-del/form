import { expect, test } from '@playwright/test'
import { blockTexts, blockTypes, newPage, startFresh } from './helpers'

test.describe('pages', () => {
  test('créer une page, écrire, recharger : tout est retrouvé', async ({ page }) => {
    await newPage(page, 'Ma page de test')
    await page.keyboard.type('Première ligne')
    await page.waitForTimeout(1000) // l'enregistrement se fait quelques instants après la frappe
    await page.reload()
    await page.getByRole('button', { name: 'Ma page de test' }).first().click()
    await expect(page.getByLabel('Titre de la page')).toHaveValue('Ma page de test')
    expect(await blockTexts(page)).toContain('Première ligne')
  })

  test('la corbeille : mettre une page, la retrouver, la restaurer', async ({ page }) => {
    await newPage(page, 'À jeter')
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Mettre à la corbeille' }).click()
    await page.getByRole('button', { name: 'Corbeille', exact: true }).click()
    await expect(page.getByText('À jeter')).toBeVisible()
    await page.getByRole('button', { name: 'Restaurer' }).click()
    await expect(page.getByRole('button', { name: 'À jeter' }).first()).toBeVisible()
  })

  test('Ctrl+K retrouve une page par son contenu', async ({ page }) => {
    await newPage(page, 'Recherchable')
    await page.keyboard.type('mot-rare-xyz')
    await page.waitForTimeout(1000)
    await page.keyboard.press('Control+k')
    const box = page.getByRole('combobox', { name: 'Rechercher dans Form' })
    await expect(box).toBeFocused()
    await box.fill('mot-rare')
    await expect(page.getByRole('option').first()).toContainText('Recherchable')
    await page.keyboard.press('Escape')
    await expect(box).toBeHidden()
  })

  test('Ctrl+F compte et parcourt les résultats', async ({ page }) => {
    await newPage(page, 'Chercher')
    await page.keyboard.type('alpha')
    await page.keyboard.press('Enter')
    await page.keyboard.type('beta')
    await page.keyboard.press('Control+f')
    const find = page.getByLabel('Chercher dans la page')
    await find.fill('a')
    await expect(page.getByRole('search')).toContainText('1 / 3')
    await find.press('Enter')
    await expect(page.getByRole('search')).toContainText('2 / 3')
    await find.press('Escape')
    await expect(find).toBeHidden()
  })

  test('une nouvelle page affiche « Premiers pas » et la barre disparaît dès qu’on écrit', async ({ page }) => {
    await startFresh(page)
    await expect(page.getByText('Premiers pas…')).toBeVisible()
    await page.keyboard.press('Enter')
    await page.keyboard.type('du contenu')
    await expect(page.getByText('Premiers pas…')).toBeHidden({ timeout: 3000 })
    expect(await blockTypes(page)).toEqual(['paragraph'])
  })
})