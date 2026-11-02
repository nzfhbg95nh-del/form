import type { BlockNoteEditor } from '@blocknote/core'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { extractIngredients } from '@/lib/recipeScale'
import { DEFAULT_EQUIVALENCES, parseEquivalences, previewConversion } from '@/lib/recipeUnits'
import { useApp } from '@/store/app'

type Ed = BlockNoteEditor<never, never, never>

const SETTING = 'recipe_equivalences'

/**
 * Aperçu de la conversion des ingrédients en g / ml / l. Rien n'est modifié tant qu'on ne clique pas sur « Appliquer » ;
 * chaque ligne se décoche, et le tableau d'équivalences se corrige ici (aperçu en direct).
 */
export function RecipeUnitsDialog({ editor, onClose }: { editor: Ed; onClose: () => void }) {
  const lines = useMemo(() => extractIngredients(editor.document as unknown as unknown[]), [editor])
  const [text, setText] = useState(DEFAULT_EQUIVALENCES)
  const [saved, setSaved] = useState(DEFAULT_EQUIVALENCES)
  const [off, setOff] = useState<Set<string>>(new Set())

  useEffect(() => {
    void useApp.getState().repo?.getSetting(SETTING).then((v) => {
      if (v) {
        setText(v)
        setSaved(v)
      }
    })
  }, [])

  const table = useMemo(() => parseEquivalences(text), [text])
  const preview = useMemo(() => previewConversion(lines, table), [lines, table])
  const chosen = preview.changes.filter((c) => !off.has(c.id))

  const persist = async () => {
    if (text === saved) return
    await useApp.getState().repo?.setSetting(SETTING, text === DEFAULT_EQUIVALENCES ? '' : text)
    setSaved(text)
  }

  const apply = async () => {
    for (const c of chosen) editor.updateBlock(c.id as never, { content: c.after } as never)
    await persist()
    onClose()
  }

  const toggle = (id: string) =>
    setOff((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const addMissing = (name: string) => setText((t) => `${t.replace(/\s*$/, '')}\n${name} = `)

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/40 py-[5vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Corriger les quantités"
        className="w-[760px] max-w-[94vw] rounded-lg border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2 className="text-xl font-bold">Corriger les quantités (g, ml, l)</h2>
        <p className="mb-4 mt-1 text-sm text-[var(--fg-muted)]">
          Voici ce qui changerait dans la liste « Ingrédients ». Rien n’est modifié tant que tu ne cliques pas sur « Appliquer ». Les liquides restent en ml ou en litres, les autres ingrédients passent en grammes.
        </p>

        {preview.changes.length === 0 ? (
          <p className="rounded-md bg-[var(--bg-hover)] px-3 py-3 text-sm">Aucune quantité à corriger dans cette recette.</p>
        ) : (
          <ul className="max-h-[38vh] overflow-y-auto rounded-md border border-[var(--border)]">
            {preview.changes.map((c) => (
              <li key={c.id} className="flex items-start gap-3 border-b border-[var(--border)] px-3 py-2 text-sm last:border-b-0">
                <input type="checkbox" className="mt-1" checked={!off.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Appliquer : ${c.after}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[var(--fg-muted)] line-through">{c.before}</div>
                  <div className="font-medium">{c.after}</div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {preview.missing.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium text-[var(--fg-muted)]">À compléter : ces ingrédients ne sont pas dans le tableau (lignes laissées telles quelles). Clique pour les ajouter.</div>
            <div className="flex flex-wrap gap-1.5">
              {preview.missing.map((m) => (
                <button key={m} type="button" className="btn !px-2 !py-0.5 text-xs" onClick={() => addMissing(m)}>
                  + {m}
                </button>
              ))}
            </div>
          </div>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">Modifier le tableau d’équivalences</summary>
          <p className="mb-2 mt-2 text-xs text-[var(--fg-muted)]">Une ligne : « ingrédient = valeur ». Exemples : « oignon = 110 g », « cannelle = 0,5 g/ml », « huile = liquide », « œuf = garder ». L’aperçu se met à jour en direct.</p>
          <textarea
            className="lib-input h-56 w-full font-mono text-xs"
            value={text}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            aria-label="Tableau d’équivalences"
          />
          {table.errors.length > 0 && (
            <div className="mt-1 text-xs text-[var(--danger,#d33)]">
              {table.errors.length} ligne{table.errors.length > 1 ? 's' : ''} non comprise{table.errors.length > 1 ? 's' : ''} (ignorée{table.errors.length > 1 ? 's' : ''}) : {table.errors.slice(0, 3).join(' · ')}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn" disabled={text === saved} onClick={() => void persist()}>Enregistrer le tableau</button>
            <button type="button" className="btn" onClick={() => setText(DEFAULT_EQUIVALENCES)}>Remettre les valeurs de départ</button>
          </div>
        </details>

        <div className="mt-5 flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-[var(--fg-muted)]">Ctrl+Z dans la page annule l’opération.</span>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn-primary" disabled={chosen.length === 0} onClick={() => void apply()}>
            Appliquer {chosen.length} changement{chosen.length > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
