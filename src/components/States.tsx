import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

/** « Rien ici » : un petit dessin, une phrase, une aide et, si possible, le bouton qui règle le problème. Le même partout. */
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center" role="status">
      {icon && <div className="text-[var(--fg-muted)] opacity-70">{icon}</div>}
      <div className="text-sm font-medium text-[var(--fg)]">{title}</div>
      {hint && <p className="max-w-sm text-sm text-[var(--fg-muted)]">{hint}</p>}
      {action && (
        <button className="mt-2 rounded bg-[var(--accent)] px-4 py-1.5 text-sm text-white hover:opacity-90" onClick={action.onClick}>{action.label}</button>
      )}
    </div>
  )
}

/** Un chargement : un petit rond qui tourne et un mot, au milieu de la zone (pas d'écran vide qui fait croire à un blocage). */
export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm text-[var(--fg-muted)]" role="status" aria-live="polite">
      <Loader2 size={16} className="spin" /> {label}
    </div>
  )
}
