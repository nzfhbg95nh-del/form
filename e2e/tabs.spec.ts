import { expect, test, type Page } from '@playwright/test'
import { createPageFromSidebar, newPage } from './helpers'

const tabs = (page: Page) => page.getByRole('tab')
const widths = async (page: Page) => (await tabs(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width))))

async function twoPages(page: Page) {
  await newPage(page, 'Alpha')
  await createPageFromSidebar(page)
  await page.keyboard.type('Beta')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
}

test.describe('onglets comme Notion', () => {
  test('un clic dans la barre latérale change le contenu de l’onglet actif, sans en ajouter', async ({ page }) => {
    await twoPages(page)
    const before = await tabs(page).count()
    await page.locator('aside').getByRole('button', { name: 'Alpha' }).first().click()
    await expect(page.getByLabel('Titre de la page')).toHaveValue('Alpha')
    expect(await tabs(page).count()).toBe(before)
    await expect(page.getByRole('tab', { selected: true })).toContainText('Alpha')
    await page.locator('aside').getByRole('button', { name: 'Corbeille', exact: true }).click()
    expect(await tabs(page).count()).toBe(before)
    await expect(page.getByRole('tab', { selected: true })).toContainText('Corbeille')
  })

  test('tous les onglets ont la même largeur', async ({ page }) => {
    await twoPages(page)
    await page.getByRole('tab', { selected: true }).click({ button: 'right' })
    await page.getByRole('button', { name: /Dupliquer l.onglet/ }).click()
    await page.getByRole('tab', { selected: true }).click({ button: 'right' })
    await page.getByRole('button', { name: /Dupliquer l.onglet/ }).click()
    const w = await widths(page)
    expect(w.length).toBeGreaterThanOrEqual(3)
    expect(Math.min(...w)).toBeGreaterThanOrEqual(170)
    expect(Math.max(...w) - Math.min(...w)).toBeLessThanOrEqual(1)
  })

  test('dupliquer un onglet, puis le fermer : les autres restent', async ({ page }) => {
    await twoPages(page)
    const before = await tabs(page).count()
    await page.getByRole('tab', { selected: true }).click({ button: 'right' })
    await page.getByRole('button', { name: /Dupliquer l.onglet/ }).click()
    expect(await tabs(page).count()).toBe(before + 1)
    const titles = await tabs(page).allInnerTexts()
    expect(titles.filter((t) => t.includes('Beta')).length).toBe(2)
    await page.getByRole('tab', { selected: true }).hover()
    await page.getByRole('tab', { selected: true }).getByRole('button', { name: 'Fermer l\'onglet' }).click()
    expect(await tabs(page).count()).toBe(before)
  })

  test('il reste toujours au moins un onglet', async ({ page }) => {
    await page.goto('/')
    for (let i = 0; i < 4; i++) {
      const n = await tabs(page).count()
      if (n <= 1) break
      await tabs(page).last().hover()
      await tabs(page).last().getByRole('button', { name: 'Fermer l\'onglet' }).click()
    }
    expect(await tabs(page).count()).toBe(1)
    await expect(tabs(page).first().getByRole('button', { name: 'Fermer l\'onglet' })).toHaveCount(0)
  })

  test('Précédent et Suivant sont propres à chaque onglet', async ({ page }) => {
    await twoPages(page)
    const title = page.getByLabel('Titre de la page')
    await page.getByRole('tab', { selected: true }).click({ button: 'right' })
    await page.getByRole('button', { name: /Dupliquer l.onglet/ }).click()
    await page.locator('aside').getByRole('button', { name: 'Alpha' }).first().click()
    await expect(title).toHaveValue('Alpha')
    await page.getByRole('button', { name: /Précédent/ }).click()
    await expect(title).toHaveValue('Beta')
    await page.getByRole('button', { name: /Suivant/ }).click()
    await expect(title).toHaveValue('Alpha')
    await tabs(page).first().click()
    await expect(title).toHaveValue('Beta')
    await expect(page.getByRole('button', { name: /Suivant/ })).toBeDisabled()
  })

  test('le bouton + ouvre un nouvel onglet : l’onglet Accueil reste en place', async ({ page }) => {
    await page.goto('/')
    await expect(tabs(page)).toHaveCount(1)
    await expect(tabs(page).first()).toContainText('Accueil')
    expect((await widths(page))[0]).toBeGreaterThanOrEqual(170)
    await page.getByRole('button', { name: /Nouvel onglet/ }).click()
    await page.getByRole('option', { name: /Nouvelle page/ }).click()
    await expect(tabs(page)).toHaveCount(2)
    await expect(tabs(page).first()).toContainText('Accueil')
    await page.getByRole('button', { name: /Nouvel onglet/ }).click()
    await page.getByRole('combobox').fill('Recettes')
    await page.getByRole('option', { name: /Recettes/ }).first().click()
    await expect(tabs(page)).toHaveCount(3)
    await expect(tabs(page).first()).toContainText('Accueil')
  })

  test('on déplace un onglet en le glissant, l’onglet actif reste le même', async ({ page }) => {
    await twoPages(page)
    await page.getByRole('tab', { selected: true }).click({ button: 'right' })
    await page.getByRole('button', { name: /Dupliquer l.onglet/ }).click()
    await page.locator('aside').getByRole('button', { name: 'Alpha' }).first().click()
    const before = (await tabs(page).allInnerTexts()).map((s) => s.trim())
    expect(before.slice(-2)).toEqual(['Beta', 'Alpha'])
    await tabs(page).last().dragTo(tabs(page).nth(before.length - 2), { targetPosition: { x: 6, y: 10 } })
    const after = (await tabs(page).allInnerTexts()).map((s) => s.trim())
    expect(after.slice(-2)).toEqual(['Alpha', 'Beta'])
    await expect(page.getByRole('tab', { selected: true })).toContainText('Alpha')
    await expect(page.getByLabel('Titre de la page')).toHaveValue('Alpha')
  })
})