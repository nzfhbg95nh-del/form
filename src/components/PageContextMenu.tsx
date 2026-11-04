import { useEffect, useState } from 'react'
import { useApp } from '@/store/app'

/**
 * Clic droit sur une page affichée comme une carte ou une ligne (recette, ligne de base, page de l'accueil…) : « Ouvrir » ou
 * « Ouvrir dans un nouvel onglet », comme dans Notion. Un élément se déclare avec l'attribut `data-page-id`.
 * Le clic du milieu ouvre aussi dans un nouvel onglet. Un seul composant, monté une fois dans l'application.
 */
const pageIdOf = (target: EventTarget | null): string | null =>
  target instanceof Element ? target.closest<HTMLElement>('[data-page-id]')?.dataset.pageId ?? null : null

export function PageContextMenu() {
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      const id = pageIdOf(e.target)
      if (!id) return
      e.preventDefault()
      setMenu({ id, x: e.clientX, y: e.clientY })
    }
    const onAux = (e: MouseEvent) => {
      if (e.button !== 1) return
      const id = pageIdOf(e.target)
      if (!id) return
      e.preventDefault()
      useApp.getState().select(id, { newTab: true })
    }
    // Le clic du milieu ferait défiler la page : on l'empêche sur ces éléments.
    const onDown = (e: MouseEvent) => { if (e.button === 1 && pageIdOf(e.target)) e.preventDefault() }
    document.addEventListener('contextmenu', onContext)
    document.addEventListener('auxclick', onAux)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('contextmenu', onContext)
      document.removeEventListener('auxclick', onAux)
      document.removeEventListener('mousedown', onDown)
    }
  }, [])

  if (!menu) return null
  const close = () => setMenu(null)
  const open = (newTab: boolean) => { useApp.getState().select(menu.id, { newTab }); close() }
  return (
    <div className="fixed inset-0 z-[70]" onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close() }}>
      <div
        role="menu"
        className="absolute min-w-52 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 text-sm shadow-lg"
        style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 90) }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button role="menuitem" autoFocus className="flex w-full items-center rounded px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]" onClick={() => open(false)}>Ouvrir</button>
        <button role="menuitem" className="flex w-full items-center rounded px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]" onClick={() => open(true)}>Ouvrir dans un nouvel onglet</button>
      </div>
    </div>
  )
}
