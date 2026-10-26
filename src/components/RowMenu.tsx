import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useApp } from '@/store/app'

export interface RowAction {
  label: string
  onClick: () => void
  /** Action qui supprime : écrite en rouge. */
  danger?: boolean
  /** Grisée ; `hint` dit pourquoi. */
  disabled?: boolean
  hint?: string
}

/** Un petit message en bas de l'écran (4 s), pour dire qu'une action de la liste n'a pas pu se faire. */
export function rowToast(text: string) {
  useApp.setState({ toast: text })
  window.setTimeout(() => useApp.setState({ toast: null }), 4000)
}

/** Lance une action de liste : si elle échoue, le message d'erreur s'affiche au lieu de ne rien dire. */
export const runRowAction = (fn: () => Promise<unknown>) => void fn().catch((e) => rowToast(e instanceof Error ? e.message : String(e)))

/**
 * La colonne « ⋯ » à droite d'une ligne de tableau (devis, factures, clients…). Elle apparaît quand on survole la ligne (le `<tr>` porte la classe `group`)
 * et ouvre un menu d'actions ; cliquer dedans n'ouvre pas la ligne.
 */
export function RowMenu({ actions, label }: { actions: RowAction[]; label: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const close = () => setPos(null)
  return (
    <td className="w-10 py-1 pl-1 text-right" onClick={(e) => e.stopPropagation()}>
      <button
        title="Plus d'actions"
        aria-label={`Actions pour ${label}`}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPos(pos ? null : { x: r.right, y: r.bottom + 4 }) }}
        className={'rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--border)] hover:text-[var(--fg)] group-hover:opacity-100 focus:opacity-100 ' + (pos ? 'opacity-100' : 'opacity-0')}
      >
        <MoreHorizontal size={16} />
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close() }} />
          <div role="menu" className="fixed z-50 w-64 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 text-left shadow-xl" style={{ left: Math.max(8, Math.min(pos.x - 256, window.innerWidth - 270)), top: Math.min(pos.y, window.innerHeight - 40 * actions.length - 20) }}>
            {actions.map((a) => (
              <button
                key={a.label}
                role="menuitem"
                disabled={a.disabled}
                title={a.disabled ? a.hint : undefined}
                onClick={() => { close(); a.onClick() }}
                className={'flex w-full flex-col rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:hover:bg-transparent ' + (a.danger ? 'text-red-500' : '')}
              >
                {a.label}
                {a.disabled && a.hint && <span className="text-xs text-[var(--fg-muted)]">{a.hint}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </td>
  )
}

/** L'en-tête vide de la colonne « ⋯ ». */
export const RowMenuHead = () => <th className="w-10" />
