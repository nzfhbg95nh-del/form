import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Une fenêtre de Form, au style des cartes d'aide : fond assombri, carte blanche, titre, contenu sur un panneau gris clair, boutons en bas à droite.
 * Un clic à côté ou Échap ferme (`onClose`). `top` : la fenêtre se place en haut de l'écran (longs formulaires) au lieu du milieu.
 * `plain` : pas de panneau gris (le contenu gère son propre fond).
 */
export function Dialog({ title, onClose, children, footer, width = 460, top = false, plain = false, role = 'dialog', z = 50, label }: {
  title?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  top?: boolean
  plain?: boolean
  role?: 'dialog' | 'alertdialog'
  z?: number
  label?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      className={'form-overlay fixed inset-0 flex justify-center overflow-y-auto p-4 ' + (top ? 'items-start py-[8vh]' : 'items-center')}
      style={{ zIndex: z }}
      onMouseDown={onClose}
    >
      <div
        role={role}
        aria-modal="true"
        aria-label={label ?? (typeof title === 'string' ? title : undefined)}
        className="form-dialog max-w-[94vw]"
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="form-dialog-head">
            <h2>{title}</h2>
            <button className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]" onClick={onClose} aria-label="Fermer" title="Fermer (Échap)"><X size={16} /></button>
          </div>
        )}
        {plain ? children : <div className="form-dialog-body">{children}</div>}
        {footer && <div className="form-dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}
