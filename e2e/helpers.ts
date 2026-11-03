import { expect, type Page } from '@playwright/test'

/** Ouvre Form tout neuf et crée une page vide (le curseur arrive dans le titre). */
export async function startFresh(page: Page) {
  await page.goto('/')
  await createPageFromSidebar(page)
}

/** Le bouton « + Nouvelle page » est le dernier de la barre latérale (les pages de la liste portent parfois le même nom). */
export async function createPageFromSidebar(page: Page) {
  const create = page.locator('aside').getByRole('button', { name: 'Nouvelle page', exact: true }).last()
  await expect(create).toBeVisible()
  await create.click()
  await expect(page.getByLabel('Titre de la page')).toBeFocused()
}

/** Nouvelle page avec un titre, curseur dans le corps de la page. */
export async function newPage(page: Page, title: string) {
  await startFresh(page)
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await expect(page.locator('.bn-editor')).toBeFocused()
}

export const blockTypes = (page: Page) =>
  page.locator('.page-body .bn-block-content').evaluateAll((els) => els.map((e) => e.getAttribute('data-content-type') ?? ''))

export const blockTexts = (page: Page) => page.locator('.page-body .bn-block-content').evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.trim()))

/** Une petite image de test (PNG de couleur unie) collée dans l'éditeur, comme un vrai collage. */
export async function pasteImage(page: Page, color: string) {
  await page.evaluate(async (c) => {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 80
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = c
    ctx.fillRect(0, 0, 120, 80)
    const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), 'image/png'))
    const dt = new DataTransfer()
    dt.items.add(new File([blob], 'test.png', { type: 'image/png' }))
    document.querySelector('.bn-editor')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, color)
  await page.waitForTimeout(600)
}