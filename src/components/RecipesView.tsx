import { useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Icon } from '@/components/Icon'
import { IconPicker } from '@/components/PagePickers'
import { firstImageUrl } from '@/lib/content'
import { parseValues, type Schema } from '@/lib/database'
import {
  addCategory, groupByCategory, recipeCategories, RECIPE, removeCategory, renameCategory, setCategoryEmoji,
  type RecipeCategory,
} from '@/lib/recipes'
import { displayTitle } from '@/lib/lastEdit'
import type { ObjectRow } from '@/lib/types'
import { useApp } from '@/store/app'

const NONE = '__none'
const button = 'rounded px-2 py-1 text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]'

/** Carte d'une recette : sa photo (couverture, sinon première image de la page, sinon l'icône) et son titre. */
function RecipeCard({ row }: { row: ObjectRow }) {
  const select = useApp((s) => s.select)
  const photo = row.cover ? null : firstImageUrl(row.content, `${row.id}:${row.updated_at}`)
  const style = row.cover
    ? row.cover.startsWith('data:')
      ? { backgroundImage: `url("${row.cover}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: row.cover }
    : photo
      ? { backgroundImage: `url("${photo}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : undefined
  return (
    <button onClick={() => select(row.id)} className="overflow-hidden rounded-md border border-[var(--border)] text-left hover:bg-[var(--bg-hover)]">
      <div className="flex h-32 items-center justify-center bg-[var(--bg-side)]" style={style}>
        {!row.cover && !photo && <Icon value={row.icon ?? '🍳'} size={40} />}
      </div>
      <div className="truncate p-2 text-sm font-medium">{displayTitle(row.title)}</div>
    </button>
  )
}

/**
 * La page « Recettes » : d'abord la liste des catégories (avec leur emoji), puis, dans une catégorie, la galerie de ses recettes
 * (photo + titre). Un clic sur une carte ouvre la recette.
 */
export function RecipesView({ db, schema }: { db: ObjectRow; schema: Schema }) {
  const { objects, saveSchema, addRecipe, setAssistant } = useApp()
  const [current, setCurrent] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const categories = useMemo(() => recipeCategories(schema), [schema])
  const rows = useMemo(() => objects.filter((o) => o.type === 'row' && o.parent_id === db.id && !o.deleted_at), [objects, db.id])
  const { byCategory, none } = useMemo(() => groupByCategory(rows, categories, (r) => parseValues(r.properties)[RECIPE.type]), [rows, categories])
  const category: RecipeCategory | undefined = categories.find((c) => c.id === current)
  const sorted = (list: ObjectRow[]) => [...list].sort((a, b) => displayTitle(a.title).localeCompare(displayTitle(b.title), 'fr'))

  const save = (next: Schema) => void saveSchema(db.id, next)
  const create = (categoryId?: string) => void addRecipe(categoryId ? { [RECIPE.type]: categoryId } : undefined)

  // ── Dans une catégorie ou dans « Sans catégorie » : la galerie ──
  if (current !== null && (category || current === NONE)) {
    const list = sorted(category ? (byCategory.get(category.id) ?? []) : none)
    return (
      <div className="mx-auto max-w-5xl px-12 py-10">
        <button className={button + ' mb-4 flex items-center gap-1'} onClick={() => setCurrent(null)}><ArrowLeft size={14} /> Recettes</button>
        <div className="mb-6 flex items-center gap-3">
          {category ? (
            <>
              <IconPicker
                value={category.emoji}
                onChange={(v) => v && save(setCategoryEmoji(schema, category.id, v))}
                trigger={<Icon value={category.emoji} size={40} />}
              />
              <input
                key={category.id}
                defaultValue={category.label}
                aria-label="Nom de la catégorie"
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name && name !== category.label) save(renameCategory(schema, category.id, name))
                  else e.target.value = category.label
                }}
                className="min-w-0 flex-1 bg-transparent py-1 text-3xl font-bold leading-[1.3] outline-none"
              />
              <button
                className={button}
                title="Supprimer la catégorie (ses recettes ne sont pas supprimées)"
                onClick={() => {
                  if (!window.confirm(`Supprimer la catégorie « ${category.label} » ? Ses recettes ne sont pas supprimées : elles passent dans « Sans catégorie ».`)) return
                  save(removeCategory(schema, category.id))
                  setCurrent(null)
                }}
              >
                <Trash2 size={16} />
              </button>
            </>
          ) : (
            <h1 className="py-1 text-3xl font-bold leading-[1.3]">Sans catégorie</h1>
          )}
        </div>
        <div className="grid items-start gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {list.map((row) => <RecipeCard key={row.id} row={row} />)}
          <button
            onClick={() => create(category?.id)}
            className="flex h-[168px] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border)] text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
          >
            <Plus size={18} /> Nouvelle recette
          </button>
        </div>
        {list.length === 0 && <p className="mt-4 text-sm text-[var(--fg-muted)]">Pas encore de recette ici.</p>}
      </div>
    )
  }

  // ── Accueil des recettes : la liste des catégories ──
  const row = 'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-[var(--bg-hover)]'
  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="flex-1 py-1 text-4xl font-bold leading-[1.3]">Recettes</h1>
        <button className={button} onClick={() => setAssistant('recipe')} title="Écrire la recette à partir d'une vidéo YouTube ou d'un texte collé">✨ Depuis une vidéo ou un texte</button>
        <button className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-white" onClick={() => create()}>+ Nouvelle recette</button>
      </div>

      <nav aria-label="Catégories de recettes">
        {categories.map((c) => (
          <button key={c.id} className={row} onClick={() => setCurrent(c.id)}>
            <Icon value={c.emoji} size={28} />
            <span className="flex-1 text-lg font-medium underline decoration-[var(--border)] underline-offset-4">{c.label}</span>
            <span className="text-sm text-[var(--fg-muted)]">{byCategory.get(c.id)?.length ?? 0}</span>
          </button>
        ))}
        {none.length > 0 && (
          <button className={row} onClick={() => setCurrent(NONE)}>
            <Icon value="📄" size={28} />
            <span className="flex-1 text-lg font-medium text-[var(--fg-muted)]">Sans catégorie</span>
            <span className="text-sm text-[var(--fg-muted)]">{none.length}</span>
          </button>
        )}
      </nav>

      <form
        className="mt-3 flex items-center gap-2 px-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (newName.trim()) {
            save(addCategory(schema, newName))
            setNewName('')
          }
        }}
      >
        <Plus size={16} className="text-[var(--fg-muted)]" />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nouvelle catégorie…"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-[var(--fg-muted)]"
        />
      </form>
    </div>
  )
}
