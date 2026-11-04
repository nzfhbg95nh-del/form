import { expect, test } from '@playwright/test'

test.describe('recettes', () => {
  test('ajouter une catégorie avec le bouton « Ajouter » ou la touche Entrée', async ({ page }) => {
    await page.goto('/')
    await page.locator('aside').getByRole('button', { name: 'Recettes', exact: true }).click()
    await page.getByText('Catégorie', { exact: true }).first().click()
    await page.getByText('Gérer les catégories…').click()
    const dlg = page.getByRole('dialog', { name: 'Gérer les catégories' })
    const add = dlg.getByRole('button', { name: 'Ajouter' })
    await expect(add).toBeDisabled()
    await dlg.getByLabel('Nom de la nouvelle catégorie').fill('Sauces')
    await add.click()
    await expect(dlg.getByText('Sauces')).toBeVisible()
    await expect(dlg.getByLabel('Nom de la nouvelle catégorie')).toHaveValue('')
    await dlg.getByLabel('Nom de la nouvelle catégorie').fill('Conserves')
    await page.keyboard.press('Enter')
    await expect(dlg.getByText('Conserves')).toBeVisible()
  })
})
