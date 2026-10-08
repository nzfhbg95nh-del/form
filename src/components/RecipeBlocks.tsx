import type { BlockNoteEditor } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'
import { Minus, Plus } from 'lucide-react'
import { parseSchema, parseValues } from '@/lib/database'
import { RECIPE } from '@/lib/recipes'
import { extractIngredients, scaleFactor, scaleLine } from '@/lib/recipeScale'
import { useApp } from '@/store/app'

type Ed = BlockNoteEditor<never, never, never>
type AnyBlock = { id: string; type: string; props: Record<string, unknown> }

const btn = 'rounded border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'

// ───────────────────────── « Pour N personnes » ─────────────────────────

/** Choix du nombre de personnes : recalcule sur place les quantités de la liste « Ingrédients » de la page. */
function Portions({ editor, block }: { editor: Ed; block: AnyBlock }) {
  const current = Math.max(1, Number(block.props.servings) || 4)
  // Pour combien de personnes la recette est écrite à la base (propriété « Portions de base » de la page).
  const base = useApp((st) => {
    const page = st.objects.find((o) => o.id === st.selectedId)
    const parent = page ? st.objects.find((o) => o.id === page.parent_id) : undefined
    if (!page || !parent || parseSchema(parent.properties).kind !== 'recipes') return null
    const v = Number(parseValues(page.properties)[RECIPE.servings])
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null
  })

  const change = (next: number) => {
    const n = Math.min(99, Math.max(1, Math.round(next)))
    if (n === current) return
    const factor = scaleFactor(current, n)
    for (const line of extractIngredients(editor.document as unknown as unknown[])) {
      const scaled = scaleLine(line.text, factor)
      if (scaled !== line.text) editor.updateBlock(line.id as never, { content: scaled } as never)
    }
    editor.updateBlock(block.id as never, { props: { servings: n } } as never)
    // Une nouvelle recette partira avec ce nombre de personnes. Les « Portions de base » de la recette, elles, ne changent pas.
    void useApp.getState().repo?.setSetting('recipe_people', String(n))
  }

  return (
    <div contentEditable={false} className="flex w-full flex-wrap items-center gap-3 rounded-md bg-[var(--bg-hover)] px-3 py-2 text-sm">
      <span className="font-medium">Pour</span>
      <div className="flex items-center gap-1">
        <button type="button" className={btn} aria-label="Une personne de moins" disabled={current <= 1} onClick={() => change(current - 1)}><Minus size={14} /></button>
        <span className="w-10 text-center text-lg font-semibold tabular-nums" aria-live="polite">{current}</span>
        <button type="button" className={btn} aria-label="Une personne de plus" onClick={() => change(current + 1)}><Plus size={14} /></button>
      </div>
      <span className="font-medium">personne{current > 1 ? 's' : ''}</span>
      {base !== null && current !== base && (
        <button type="button" className={btn} onClick={() => change(base)}>Revenir à {base}</button>
      )}
      <span className="text-xs text-[var(--fg-muted)]">
        {base !== null ? `Recette écrite pour ${base} personne${base > 1 ? 's' : ''}. ` : ''}Les quantités de la liste « Ingrédients » s’adaptent toutes seules (Ctrl+Z pour revenir en arrière).
      </span>
    </div>
  )
}

export const createPortionsBlock = createReactBlockSpec(
  { type: 'portions', propSchema: { servings: { default: 4 } }, content: 'none' },
  { render: (props) => <Portions editor={props.editor as unknown as Ed} block={props.block as unknown as AnyBlock} /> },
)

// ───────────────────────── Ancienne photo de recette ─────────────────────────

/** Les photos déjà enregistrées par une ancienne version restent visibles (plus de génération par l'IA). */
function LegacyRecipePhoto({ block }: { block: AnyBlock }) {
  const src = String(block.props.src ?? '')
  if (!src) return <div contentEditable={false} className="h-1 w-full" />
  return <img contentEditable={false} src={src} alt="Photo de la recette" draggable={false} className="max-h-[360px] w-full rounded-md object-cover" />
}

export const createRecipePhotoBlock = createReactBlockSpec(
  { type: 'recipephoto', propSchema: { src: { default: '' } }, content: 'none' },
  { render: (props) => <LegacyRecipePhoto block={props.block as unknown as AnyBlock} /> },
)
