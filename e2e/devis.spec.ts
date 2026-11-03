import { expect, test } from '@playwright/test'

test.describe('devis', () => {
  test('un devis à partir d’un tarif : total, acompte de 30 % et mention de franchise de TVA', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Clients', exact: true }).click()
    await page.getByRole('button', { name: 'Nouveau client' }).first().click()
    await page.getByLabel('Raison sociale').fill('Client Devis')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await page.getByRole('button', { name: 'Devis', exact: true }).click()
    await page.getByRole('button', { name: /Nouveau devis/ }).first().click()
    await page.locator('select').first().selectOption({ label: 'Client Devis' })
    // « Depuis mes tarifs… » : on ajoute la ligne Graphisme (300 € le jour)
    const tarifs = page.locator('select', { hasText: 'Depuis mes tarifs' })
    await tarifs.selectOption({ label: await tarifs.locator('option', { hasText: 'Graphisme' }).innerText() })
    const main = page.locator('main')
    await expect(main).toContainText('Total HT')
    // une ligne à 300 € le jour, quantité 1 : total 300 €, acompte de 30 % = 90 €, mention de franchise de TVA
    await expect(main).toContainText('Total HT300,00 €')
    await expect(main).toContainText('Acompte 30 %90,00 €')
    await expect(main).toContainText('TVA non applicable, art. 293 B du CGI')
  })
})