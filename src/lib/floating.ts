import { isTauri } from './repo'

/** Identifiant d'un moodboard demandé dans l'adresse (`?board=…`) : la fenêtre flottante n'affiche que celui-là. */
export function floatingBoardId(search: string = typeof location === 'undefined' ? '' : location.search): string | null {
  const id = new URLSearchParams(search).get('board')
  return id && /^[\w-]{1,64}$/.test(id) ? id : null
}

/** Nom interne de la fenêtre flottante d'un moodboard (lettres, chiffres, tirets). */
export const floatingLabel = (boardId: string) => `board-${boardId.replace(/[^\w-]/g, '')}`

/** Adresse relative de la page de la fenêtre flottante. */
export const floatingUrl = (boardId: string) => `index.html?board=${encodeURIComponent(boardId)}`

export const FLOATING_EVENT = 'floating-board'

/**
 * Ouvre le moodboard dans une petite fenêtre sans bordure, toujours au premier plan (comme PureRef).
 * Si elle est déjà ouverte, on la ramène devant. Renvoie false hors de l'application Windows.
 */
export async function openFloatingBoard(boardId: string, title: string): Promise<boolean> {
  if (!isTauri()) {
    // Navigateur (essais) : simple fenêtre secondaire.
    window.open(`/${floatingUrl(boardId)}`, '_blank', 'popup,width=520,height=680')
    return false
  }
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const label = floatingLabel(boardId)
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.setFocus()
    return true
  }
  const win = new WebviewWindow(label, {
    url: floatingUrl(boardId),
    title: `${title || 'Moodboard'} — Form`,
    width: 520,
    height: 680,
    minWidth: 240,
    minHeight: 200,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    dragDropEnabled: false,
  })
  await new Promise<void>((resolve, reject) => {
    void win.once('tauri://created', () => resolve())
    void win.once('tauri://error', (e) => reject(new Error(String(e.payload))))
  })
  return true
}

/** Ferme la fenêtre flottante d'un moodboard, si elle existe. */
export async function closeFloatingBoard(boardId: string): Promise<void> {
  if (!isTauri()) return
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const win = await WebviewWindow.getByLabel(floatingLabel(boardId))
  await win?.close()
}

/** Identifiants des moodboards actuellement ouverts en fenêtre flottante. */
export async function openFloatingBoardIds(): Promise<string[]> {
  if (!isTauri()) return []
  const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow')
  return (await getAllWebviewWindows()).map((w) => w.label).filter((l) => l.startsWith('board-')).map((l) => l.slice('board-'.length))
}
