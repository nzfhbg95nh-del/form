import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, MoreHorizontal, PenLine, Plus, Smile, Trash2 } from 'lucide-react'
import { Icon } from '@/components/Icon'
import { PageEditor } from '@/components/PageEditor'
import { IconPicker } from '@/components/PagePickers'
import { firstImageUrl } from '@/lib/content'
import { parseValues, type Schema } from '@/lib/database'
import {
  addCategory, groupByCategory, moveCategory, normalizeRecipesSchema, recipeCategories, RECIPE, removeCategory, renameCategory, setCategoryEmoji,
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
 * Espace de notes rapides sous la liste des catégories : un vrai éditeur de page (listes, cases à cocher, titres, commande « / »),
 * enregistré tout seul dans la base « Recettes » 0,5 s après la dernière frappe (et à la fermeture de la page).
 */
function QuickNotes({ db }: { db: ObjectRow }) {
  const update = useApp((s) => s.update)
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<string | null>(null)
  const flush = () => {
    window.clearTimeout(timer.current)
    if (pending.current !== null) {
      const content = pending.current
      pending.current = null
      void update(db.id, { content })
    }
  }
  // Une modification en attente est enregistrée si on quitte la page avant les 0,5 s.
  useEffect(() => flush, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="mt-8 border-t border-[var(--border)] pt-4" aria-label="Notes rapides">
      <h2 className="mb-1 text-sm font-medium text-[var(--fg-muted)]">Notes rapides</h2>
      <div className="-mx-12">
        <PageEditor
          key={db.id}
          pageId={db.id}
          initial={db.content}
          onChange={(json) => {
            pending.current = json
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(flush, 500)
          }}
        />
      </div>
    </section>
  )
}

/** Fenêtre « Dans quelle catégorie ? » : on choisit une catégorie, ou on tape un nom pour en créer une (cliquer à côté ferme). */
function CategoryChooser({ categories, onPick, onCreate, onClose }: { categories: RecipeCategory[]; onPick: (id: string | undefined) => void; onCreate: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const item = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[15vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Dans quelle catégorie ?"
        className="max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2 className="mb-2 text-sm font-semibold">Dans quelle catégorie ?</h2>
        {categories.length === 0 && <p className="mb-2 text-xs text-[var(--fg-muted)]">Tu n’as pas encore de catégorie : donne un nom à la première, elle sera créée pour toi.</p>}
        {categories.map((c) => (
          <button key={c.id} className={item} onClick={() => onPick(c.id)}><Icon value={c.emoji} size={18} /> {c.label}</button>
        ))}
        <form
          className="mt-2 flex items-center gap-2 border-t border-[var(--border)] pt-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) onCreate(name.trim())
          }}
        >
          <Plus size={14} className="shrink-0 text-[var(--fg-muted)]" />
          <input
            autoFocus={categories.length === 0}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nouvelle catégorie…"
            aria-label="Nom de la nouvelle catégorie"
            className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-[var(--fg-muted)]"
          />
          <button type="submit" disabled={!name.trim()} className="rounded bg-[var(--accent)] px-3 py-1 text-xs text-white disabled:opacity-40">Créer</button>
        </form>
        <button className={item + ' mt-1 text-[var(--fg-muted)]'} onClick={() => onPick(undefined)}>Sans catégorie pour l’instant</button>
      </div>
    </div>
  )
}

/**
 * La page « Recettes » : d'abord la liste des catégories (avec leur emoji), puis, dans une catégorie, la galerie de ses recettes
 * (photo + titre). Un clic sur une carte ouvre la recette.
 */
export function RecipesView({ db, schema }: { db: ObjectRow; schema: Schema }) {
  const { objects, saveSchema, addRecipe, setAssistant, setCell } = useApp()
  const [current, setCurrent] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [emojiFor, setEmojiFor] = useState<string | null>(null)

  // Anciennes propriétés (durées, note, étiquettes, source) : retirées à l'ouverture.
  useEffect(() => {
    const clean = normalizeRecipesSchema(schema)
    if (clean !== schema) void saveSchema(db.id, clean)
  }, [schema, db.id, saveSchema])

  const categories = useMemo(() => recipeCategories(schema), [schema])
  const rows = useMemo(() => objects.filter((o) => o.type === 'row' && o.parent_id === db.id && !o.deleted_at), [objects, db.id])
  const { byCategory, none } = useMemo(() => groupByCategory(rows, categories, (r) => parseValues(r.properties)[RECIPE.type]), [rows, categories])
  const category: RecipeCategory | undefined = categories.find((c) => c.id === current)
  const sorted = (list: ObjectRow[]) => [...list].sort((a, b) => displayTitle(a.title).localeCompare(displayTitle(b.title), 'fr'))

  const save = (next: Schema) => void saveSchema(db.id, next)
  const confirmRemove = (c: RecipeCategory) => {
    if (!window.confirm(`Supprimer la catégorie « ${c.label} » ? Ses recettes ne sont pas supprimées : elles passent dans « Sans catégorie ».`)) return
    save(removeCategory(schema, c.id))
    setCurrent(null)
  }
  const create = (categoryId?: string) => void addRecipe(categoryId ? { [RECIPE.type]: categoryId } : undefined)
  const [choosing, setChoosing] = useState(false)

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
  const row = 'flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left hover:bg-[var(--bg-hover)]'
  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="flex-1 py-1 text-4xl font-bold leading-[1.3]">Recettes</h1>
        <button className={button} onClick={() => setAssistant('recipe')} title="Écrire la recette à partir d'une vidéo YouTube ou d'un texte collé">✨ Depuis une vidéo ou un texte</button>
        <button className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-white" onClick={() => setChoosing(true)}>+ Nouvelle recette</button>
      </div>

      <nav aria-label="Catégories de recettes">
        {categories.map((c) => (
          <div
            key={c.id}
            className="group relative"
            onContextMenu={(e) => { e.preventDefault(); setMenu({ id: c.id, x: e.clientX, y: e.clientY }) }}
          >
            {renaming === c.id ? (
              <div className={row}>
                <Icon value={c.emoji} size={20} />
                <input
                  autoFocus
                  defaultValue={c.label}
                  aria-label="Nom de la catégorie"
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') { e.currentTarget.value = c.label; e.currentTarget.blur() }
                  }}
                  onBlur={(e) => {
                    const name = e.target.value.trim()
                    if (name && name !== c.label) save(renameCategory(schema, c.id, name))
                    setRenaming(null)
                  }}
                  className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none"
                />
              </div>
            ) : (
              <button className={row} onClick={() => setCurrent(c.id)}>
                {emojiFor === c.id ? (
                  <span onClick={(e) => e.stopPropagation()}>
                    <IconPicker
                      startOpen
                      value={c.emoji}
                      onChange={(v) => v && save(setCategoryEmoji(schema, c.id, v))}
                      onClosed={() => setEmojiFor(null)}
                      trigger={<Icon value={c.emoji} size={20} />}
                    />
                  </span>
                ) : (
                  <Icon value={c.emoji} size={20} />
                )}
                <span className="flex-1 text-base font-medium underline decoration-[var(--border)] underline-offset-4">{c.label}</span>
                <span className="text-xs text-[var(--fg-muted)] group-hover:opacity-0">{byCategory.get(c.id)?.length ?? 0}</span>
              </button>
            )}
            <button
              aria-label={`Options de ${c.label}`}
              title="Options de la catégorie (ou clic droit)"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ id: c.id, x: r.left, y: r.bottom + 4 }) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--fg-muted)] opacity-0 hover:bg-[var(--border)] focus:opacity-100 group-hover:opacity-100"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
        ))}
        {none.length > 0 && (
          <div className="group relative" onContextMenu={(e) => { e.preventDefault(); setMenu({ id: NONE, x: e.clientX, y: e.clientY }) }}>
            <button className={row} onClick={() => setCurrent(NONE)}>
              <Icon value="📄" size={20} />
              <span className="flex-1 text-base font-medium text-[var(--fg-muted)]">Sans catégorie</span>
              <span className="text-xs text-[var(--fg-muted)] group-hover:opacity-0">{none.length}</span>
            </button>
            <button
              aria-label="Options de Sans catégorie"
              title="Options (ou clic droit)"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ id: NONE, x: r.left, y: r.bottom + 4 }) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--fg-muted)] opacity-0 hover:bg-[var(--border)] focus:opacity-100 group-hover:opacity-100"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
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

      <QuickNotes db={db} />

      {choosing && (
        <CategoryChooser
          categories={categories}
          onClose={() => setChoosing(false)}
          onPick={(id) => { setChoosing(false); create(id) }}
          onCreate={(name) => {
            // Une catégorie qui n'existe pas encore est créée automatiquement, puis la recette y est rangée.
            const next = addCategory(schema, name)
            const created = recipeCategories(next).at(-1)
            save(next)
            setChoosing(false)
            create(created?.id)
          }}
        />
      )}

      {menu && menu.id === NONE && (() => {
        const item = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]'
        const moveAll = (categoryId: string) => {
          setMenu(null)
          void Promise.all(none.map((r) => setCell(r.id, RECIPE.type, categoryId)))
        }
        return (
          <>
            <div className="fixed inset-0 z-40" onMouseDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }} />
            <div role="menu" className="fixed z-50 max-h-[60vh] w-64 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-xl" style={{ left: Math.min(menu.x, window.innerWidth - 272), top: Math.min(menu.y, window.innerHeight - 320) }}>
              <button role="menuitem" className={item} onClick={() => { setMenu(null); setCurrent(NONE) }}>Ouvrir</button>
              <div className="my-1 border-t border-[var(--border)]" />
              <div className="px-2 py-1 text-xs font-medium text-[var(--fg-muted)]">Ranger les {none.length} recette{none.length > 1 ? 's' : ''} dans…</div>
              {categories.map((c) => (
                <button key={c.id} role="menuitem" className={item} onClick={() => moveAll(c.id)}><Icon value={c.emoji} size={16} /> {c.label}</button>
              ))}
            </div>
          </>
        )
      })()}

      {menu && menu.id !== NONE && (() => {
        const c = categories.find((x) => x.id === menu.id)
        if (!c) return null
        const index = categories.findIndex((x) => x.id === c.id)
        const item = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent'
        const run = (fn: () => void) => () => { setMenu(null); fn() }
        return (
          <>
            <div className="fixed inset-0 z-40" onMouseDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }} />
            <div role="menu" className="fixed z-50 w-56 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-xl" style={{ left: Math.min(menu.x, window.innerWidth - 232), top: Math.min(menu.y, window.innerHeight - 220) }}>
              <button role="menuitem" className={item} onClick={run(() => setRenaming(c.id))}><PenLine size={14} /> Renommer</button>
              <button role="menuitem" className={item} onClick={run(() => setEmojiFor(c.id))}><Smile size={14} /> Changer l’emoji</button>
              <button role="menuitem" className={item} disabled={index === 0} onClick={run(() => save(moveCategory(schema, c.id, -1)))}><ArrowUp size={14} /> Monter</button>
              <button role="menuitem" className={item} disabled={index === categories.length - 1} onClick={run(() => save(moveCategory(schema, c.id, 1)))}><ArrowDown size={14} /> Descendre</button>
              <div className="my-1 border-t border-[var(--border)]" />
              <button role="menuitem" className={item + ' text-red-500'} onClick={run(() => confirmRemove(c))}><Trash2 size={14} /> Supprimer</button>
            </div>
          </>
        )
      })()}
    </div>
  )
}
