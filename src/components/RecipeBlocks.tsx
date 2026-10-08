import { useState } from 'react'
import type { BlockNoteEditor } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'
import { ImageOff, Minus, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { generateRecipePhoto, iconAiAvailable } from '@/lib/ai'
import { parseSchema } from '@/lib/database'
import { RECIPE } from '@/lib/recipes'
import { recipePhotoPrompt, resizeToJpeg } from '@/lib/recipePhoto'
import { extractIngredients, scaleFactor, scaleLine } from '@/lib/recipeScale'
import { useApp } from '@/store/app'

type Ed = BlockNoteEditor<never, never, never>
type AnyBlock = { id: string; type: string; props: Record<string, unknown> }

const btn = 'rounded border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'

/** Titre de la recette : le premier titre de niveau 1 de la page, sinon le titre de la page. */
function recipeTitle(editor: Ed): string {
  for (const b of editor.document as unknown as { type: string; props?: { level?: number }; content?: { text?: string }[] }[]) {
    if (b.type === 'heading' && (b.props?.level ?? 1) === 1 && Array.isArray(b.content)) {
      const text = b.content.map((c) => c.text ?? '').join('').trim()
      if (text) return text
    }
  }
  const st = useApp.getState()
  return st.objects.find((o) => o.id === st.selectedId)?.title ?? ''
}

// ───────────────────────── « Pour N personnes » ─────────────────────────

/** Choix du nombre de personnes : recalcule sur place les quantités de la liste « Ingrédients » de la page. */
function Portions({ editor, block }: { editor: Ed; block: AnyBlock }) {
  const current = Math.max(1, Number(block.props.servings) || 4)

  const change = (next: number) => {
    const n = Math.min(99, Math.max(1, Math.round(next)))
    if (n === current) return
    const factor = scaleFactor(current, n)
    for (const line of extractIngredients(editor.document as unknown as unknown[])) {
      const scaled = scaleLine(line.text, factor)
      if (scaled !== line.text) editor.updateBlock(line.id as never, { content: scaled } as never)
    }
    editor.updateBlock(block.id as never, { props: { servings: n } } as never)
    // Toutes les recettes s'ouvrent ensuite avec ce nombre de personnes pour une nouvelle recette ; la propriété « Portions » suit.
    const st = useApp.getState()
    void st.repo?.setSetting('recipe_people', String(n))
    const page = st.objects.find((o) => o.id === st.selectedId)
    const parent = page ? st.objects.find((o) => o.id === page.parent_id) : undefined
    if (page && parent && parseSchema(parent.properties).kind === 'recipes') void st.setCell(page.id, RECIPE.servings, n)
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
      <span className="text-xs text-[var(--fg-muted)]">Les quantités de la liste « Ingrédients » se recalculent toutes seules (Ctrl+Z pour revenir en arrière).</span>
    </div>
  )
}

export const createPortionsBlock = createReactBlockSpec(
  { type: 'portions', propSchema: { servings: { default: 4 } }, content: 'none' },
  { render: (props) => <Portions editor={props.editor as unknown as Ed} block={props.block as unknown as AnyBlock} /> },
)

// ───────────────────────── Photo de la recette (IA) ─────────────────────────

function RecipePhoto({ editor, block }: { editor: Ed; block: AnyBlock }) {
  const src = String(block.props.src ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const ingredients = extractIngredients(editor.document as unknown as unknown[]).map((l) => l.text)
      const raw = await generateRecipePhoto(recipePhotoPrompt(recipeTitle(editor), ingredients))
      const photo = await resizeToJpeg(raw)
      editor.updateBlock(block.id as never, { props: { src: photo } } as never)
      // La photo devient aussi la couverture de la page, pour la reconnaître dans la galerie des recettes.
      const st = useApp.getState()
      const page = st.objects.find((o) => o.id === st.selectedId)
      if (page && !page.cover) void st.update(page.id, { cover: photo })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const setCover = () => {
    const st = useApp.getState()
    if (st.selectedId) void st.update(st.selectedId, { cover: src })
  }

  return (
    <div contentEditable={false} className="w-full">
      {src ? (
        <figure className="m-0">
          <img src={src} alt="Photo de la recette" draggable={false} className="max-h-[360px] w-full rounded-md object-cover" />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <button type="button" className={btn} disabled={busy || !iconAiAvailable()} onClick={() => void generate()}><RefreshCw size={12} className="mr-1 inline" />{busy ? 'Génération…' : 'Autre photo'}</button>
            <button type="button" className={btn} onClick={setCover}>Utiliser comme couverture</button>
            <button type="button" className={btn} onClick={() => editor.updateBlock(block.id as never, { props: { src: '' } } as never)}><ImageOff size={12} className="mr-1 inline" />Retirer</button>
          </div>
        </figure>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-[var(--border)] px-3 py-3 text-sm">
          <button type="button" className={btn} disabled={busy || !iconAiAvailable()} onClick={() => void generate()}>
            <Sparkles size={14} className="mr-1 inline" />{busy ? 'Génération de la photo…' : 'Générer une photo de la recette avec l’IA'}
          </button>
          <span className="text-xs text-[var(--fg-muted)]">
            {iconAiAvailable() ? 'Écris d’abord le nom et quelques ingrédients : seule cette description est envoyée à Google, au moment du clic.' : 'La génération de photo n’existe que dans l’application Windows.'}
          </span>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  )
}

export const createRecipePhotoBlock = createReactBlockSpec(
  { type: 'recipephoto', propSchema: { src: { default: '' } }, content: 'none' },
  { render: (props) => <RecipePhoto editor={props.editor as unknown as Ed} block={props.block as unknown as AnyBlock} /> },
)
