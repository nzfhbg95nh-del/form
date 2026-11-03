import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createPageFromSidebar, newPage } from './helpers'

test.describe('écrans et données', () => {
  test('tous les écrans de la barre latérale s’ouvrent sans erreur', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => { if (!/invoke/.test(String(e))) errors.push(String(e)) })
    await page.goto('/')
    for (const name of ['Tableau de bord', 'Clients', 'Tarifs', 'Devis', 'Factures', 'Paiements', 'Moodboards', 'Recettes', 'Réglages', 'Corbeille', 'Accueil']) {
      await page.getByRole('button', { name, exact: true }).first().click()
      await expect(page.locator('main')).not.toBeEmpty()
    }
    expect(errors).toEqual([])
  })

  test('un client se crée et apparaît dans la liste', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Clients', exact: true }).click()
    await page.getByRole('button', { name: 'Nouveau client' }).first().click()
    await page.getByLabel('Raison sociale').fill('Studio Test')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.locator('main')).toContainText('Studio Test')
  })

  test('un SIREN douteux donne un avertissement mais n’empêche pas d’enregistrer', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Clients', exact: true }).click()
    await page.getByRole('button', { name: 'Nouveau client' }).first().click()
    await page.getByLabel('Raison sociale').fill('Client SIREN')
    await page.getByLabel('SIREN (9 chiffres)').fill('123')
    await expect(page.getByText('Le SIREN doit avoir 9 chiffres.')).toBeVisible()
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.locator('main')).toContainText('Client SIREN')
  })

  test('moodboard : importer un fichier .formboard puis le réexporter', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Moodboards', exact: true }).click()
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const url = `data:image/png;base64,${png}`
    const file = {
      format: 'form-moodboard', version: 1, exportedAt: new Date().toISOString(), title: 'Mood E2E', icon: '🖼️', coverAsset: 'a1',
      board: { v: 1, items: [{ id: 'i1', kind: 'image', x: 0, y: 0, w: 200, h: 150, assetId: 'a1' }, { id: 'i2', kind: 'note', x: 250, y: 0, w: 150, h: 100, text: 'Bonjour', color: '#fff3a3' }], view: { x: 0, y: 0, zoom: 1 }, bg: 'auto', pattern: 'auto' },
      assets: [{ id: 'a1', name: 'point.png', width: 1, height: 1, data_url: url, thumb_url: url, created_at: new Date().toISOString() }],
    }
    await page.locator('input[type="file"][accept*="formboard"]').setInputFiles({ name: 'Mood E2E.formboard', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
    await expect(page.getByText('Bonjour')).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter', exact: true }).click()])
    expect(download.suggestedFilename()).toBe('Mood E2E.formboard')
    const saved = JSON.parse(await readFile((await download.path())!, 'utf8'))
    expect(saved.format).toBe('form-moodboard')
    expect(saved.board.items).toHaveLength(2)
    expect(saved.assets).toHaveLength(1)
  })

  test('moodboard : le menu du clic droit agit puis se ferme', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Moodboards', exact: true }).click()
    const file = {
      format: 'form-moodboard', version: 1, exportedAt: new Date().toISOString(), title: 'Mood menu', icon: null, coverAsset: null,
      board: { v: 1, items: [{ id: 'n1', kind: 'note', x: 100, y: 100, w: 200, h: 120, text: 'Une note', color: '#fff3a3' }], view: { x: 0, y: 0, zoom: 1 }, bg: 'auto', pattern: 'auto' },
      assets: [],
    }
    await page.locator('input[type="file"][accept*="formboard"]').setInputFiles({ name: 'm.formboard', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
    const note = page.locator('[data-item="n1"]')
    await expect(note).toBeVisible()
    await note.click({ button: 'right' })
    const remove = page.getByRole('button', { name: 'Supprimer' })
    await expect(remove).toBeVisible()
    await remove.click()
    await expect(note).toBeHidden()
    await expect(remove).toBeHidden() // le menu s'est refermé
  })

  test('un fichier qui n’est pas un moodboard est refusé avec un message clair', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Moodboards', exact: true }).click()
    await page.locator('input[type="file"][accept*="formboard"]').setInputFiles({ name: 'faux.formboard', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') })
    await expect(page.getByText('Ce fichier n’est pas un moodboard Form.')).toBeVisible()
  })

  test('déplacer un bloc vers une autre page avec le menu du bloc', async ({ page }) => {
    await newPage(page, 'Source')
    await page.keyboard.type('à déplacer')
    await createPageFromSidebar(page)
    await page.keyboard.type('Cible')
    await page.waitForTimeout(600)
    await page.locator('aside').getByRole('button', { name: 'Source' }).first().click()
    await page.locator('.page-body .bn-block-content').first().hover()
    await page.getByRole('button', { name: 'Ouvrir le menu du bloc' }).click()
    await page.getByText('Déplacer vers une page…').click()
    await page.getByRole('dialog', { name: 'Déplacer le bloc' }).getByRole('button', { name: 'Cible' }).click()
    await expect(page.getByText('Bloc déplacé vers « Cible »')).toBeVisible()
    await page.locator('aside').getByRole('button', { name: 'Cible' }).first().click()
    await expect(page.locator('.page-body .bn-block-content', { hasText: 'à déplacer' })).toBeVisible()
  })
})