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
})
