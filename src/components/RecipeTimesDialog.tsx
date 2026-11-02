import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { RECIPE } from '@/lib/recipes'
import { recipesWithoutTime } from '@/lib/recipeTimes'
import type { ObjectRow } from '@/lib/types'
import { useApp } from '@/store/app'

/**
 * Aperçu des temps de préparation estimés pour les recettes qui n'en ont pas. Un temps déjà rempli n'est jamais touché ;
 * rien n'est enregistré tant qu'on ne clique pas sur « Enregistrer » ; chaque durée se corrige avant.
 */
export function RecipeTimesDialog({ rows, onClose }: { rows: ObjectRow[]; onClose: () => void }) {
  const setCell = useApp((s) => s.setCell)
  const { items, unknown } = useMemo(() => recipesWithoutTime(rows), [rows])
  const [minutes, setMinutes] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, String(i.minutes)])))
  const [off, setOff] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const valueOf = (id: string) => Math.round(Number(minutes[id]))
  const valid = (id: string) => Number.isFinite(valueOf(id)) && valueOf(id) > 0 && valueOf(id) <= 600
  const chosen = items.filter((i) => !off.has(i.id) && valid(i.id))

  const toggle = (id: string) =>
    setOff((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = async () => {
    setSaving(true)
    for (const i of chosen) await setCell(i.id, RECIPE.prep, valueOf(i.id))
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/40 py-[5vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Estimer les temps de préparation"
        className="w-[720px] max-w-[94vw] rounded-lg border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2 className="text-xl font-bold">Estimer les temps de préparation</h2>
        <p className="mb-4 mt-1 text-sm text-[var(--fg-muted)]">
          Ces recettes n’ont pas de temps de préparation. Voici une estimation pour chacune : d’après la ligne « Temps » des notes quand elle donne un temps actif, sinon d’après le nombre d’ingrédients et d’étapes. Corrige une durée si besoin. Rien n’est enregistré avant « Enregistrer », et les temps déjà remplis ne sont pas touchés.
        </p>

        {items.length === 0 ? (
          <p className="rounded-md bg-[var(--bg-hover)] px-3 py-3 text-sm">Toutes les recettes ont déjà un temps de préparation{unknown > 0 ? `, sauf ${unknown} qui n’ont ni ingrédients ni étapes pour estimer.` : '.'}</p>
        ) : (
          <ul className="max-h-[50vh] overflow-y-auto rounded-md border border-[var(--border)]">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-1.5 text-sm last:border-b-0">
                <input type="checkbox" checked={!off.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Enregistrer le temps de ${i.title}`} />
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <span className="w-32 shrink-0 text-xs text-[var(--fg-muted)]">{i.source === 'notes' ? 'd’après les notes' : 'estimation'}</span>
                <input
                  type="number"
                  min={1}
                  max={600}
                  className="lib-input !w-20 text-right"
                  value={minutes[i.id] ?? ''}
                  aria-label={`Minutes pour ${i.title}`}
                  aria-invalid={!valid(i.id)}
                  onChange={(e) => setMinutes((m) => ({ ...m, [i.id]: e.target.value }))}
                />
                <span className="w-8 text-xs text-[var(--fg-muted)]">min</span>
              </li>
            ))}
          </ul>
        )}
        {unknown > 0 && items.length > 0 && (
          <p className="mt-2 text-xs text-[var(--fg-muted)]">{unknown} recette{unknown > 1 ? 's' : ''} sans ingrédients ni étapes : pas d’estimation possible.</p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn-primary" disabled={chosen.length === 0 || saving} onClick={() => void save()}>
            Enregistrer {chosen.length} temps
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
