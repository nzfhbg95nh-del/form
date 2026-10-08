import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, MoreHorizontal, PenLine, Plus, Smile, Trash2 } from 'lucide-react'
import { Icon } from '@/components/Icon'
import { PageEditor } from '@/components/PageEditor'
import { IconPicker } from '@/components/PagePickers'
import { firstImageUrl } from '@/lib/content'
import { parseValues, type Schema } from '@/lib/database'
import {
  addCategory, groupByCategory, moveEntry, normalizeRecipesSchema, recipeCategories, recipeEntries, RECIPE, RECIPE_SORTS, removeCategory, renameEntry,
  setEntryEmoji, sortRecipes, type RecipeSort, type RecipeCategory, type RecipeEntry,
} from '@/lib/recipes'
import { displayTitle } from '@/lib/lastEdit'
import type { ObjectRow } from '@/lib/types'
import { useApp } from '@/store/app'

const button = 'rounded px-2 py-1 text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]'

/** Carte d'une recette : sa photo (couverture, sinon première image de la page, sinon l'icône) et son titre. */
function RecipeCard({ row }: { row: ObjectRow }) {
  const select = useApp((s) => s.select)
  const v = parseValues(row.properties)
  const stars = /^r([1-5])$/.exec(String(v[RECIPE.rating] ?? ''))
  const diff = { d1: 'Facile', d2: 'Moyen', d3: 'Difficile' }[String(v[RECIPE.difficulty] ?? '') as 'd1']
  const prep = Number(v[RECIPE.prep])
  const info = [stars ? '★'.repeat(Number(stars[1])) : '', v[RECIPE.prep] && prep > 0 ? `${prep} min` : '', diff ?? ''].filter(Boolean).join(' · ')
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
      <div className="p-2">
        <div className="truncate text-sm font-medium">{displayTitle(row.title)}</div>
        {info && <div className="mt-0.5 truncate text-xs text-[var(--fg-muted)]">{info}</div>}
      </div>
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
 * (photo + titre). Un clic sur une carte ouvre la recette. « Sans catégorie » se règle comme les autres lignes.
 */
export function RecipesView({ db, schema }: { db: ObjectRow; schema: Schema }) {
  const { objects, saveSchema, addRecipe, setAssistant, setCell, trash } = useApp()
  const [current, setCurrent] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [emojiFor, setEmojiFor] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [sortBy, setSortBy] = useState<RecipeSort>('name')

  // Anciennes propriétés (durées, note, étiquettes) retirées, « Source » remise : mise à jour à l'ouverture.
  useEffect(() => {
    const clean = normalizeRecipesSchema(schema)
    if (clean !== schema) void saveSchema(db.id, clean)
  }, [schema, db.id, saveSchema])

  const categories = useMemo(() => recipeCategories(schema), [schema])
  const rows = useMemo(() => objects.filter((o) => o.type === 'row' && o.parent_id === db.id && !o.deleted_at), [objects, db.id])
  const { byCategory, none } = useMemo(() => groupByCategory(rows, categories, (r) => parseValues(r.properties)[RECIPE.type]), [rows, categories])
  const countOf = (e: RecipeEntry) => (e.isNone ? none.length : (byCategory.get(e.id)?.length ?? 0))
  const listOf = (e: RecipeEntry) => (e.isNone ? none : (byCategory.get(e.id) ?? []))
  // « Sans catégorie » n'apparaît que s'il y a des recettes dedans ; les vraies catégories toujours.
  const entries = useMemo(() => recipeEntries(schema).filter((e) => !e.isNone || none.length > 0), [schema, none.length])
  const entry = entries.find((e) => e.id === current)
  const sorted = (list: ObjectRow[]) => sortRecipes(list, sortBy, (r) => displayTitle(r.title))

  const save = (next: Schema) => void saveSchema(db.id, next)
  const create = (categoryId?: string) => void addRecipe(categoryId ? { [RECIPE.type]: categoryId } : undefined)

  /** Supprimer une ligne : une catégorie disparaît (ses recettes passent dans « Sans catégorie »), « Sans catégorie » met ses recettes à la corbeille. */
  const confirmRemove = (e: RecipeEntry) => {
    if (e.isNone) {
      const n = none.length
      if (!window.confirm(`Mettre à la corbeille les ${n} recette${n > 1 ? 's' : ''} de « ${e.label} » ? Tu pourras les récupérer depuis la corbeille.`)) return
      void Promise.all(none.map((r) => trash(r.id)))
    } else {
      if (!window.confirm(`Supprimer la catégorie « ${e.label} » ? Ses recettes ne sont pas supprimées : elles passent dans « Sans catégorie ».`)) return
      save(removeCategory(schema, e.id))
    }
    setCurrent(null)
  }

  // ── Dans une catégorie (ou dans « Sans catégorie ») : la galerie ──
  if (current !== null && entry) {
    const list = sorted(listOf(entry))
    return (
      <div className="mx-auto max-w-5xl px-12 py-10">
        <button className={button + ' mb-4 flex items-center gap-1'} onClick={() => setCurrent(null)}><ArrowLeft size={14} /> Recettes</button>
        <div className="mb-6 flex items-center gap-3">
          <IconPicker
            value={entry.emoji}
            onChange={(v) => v && save(setEntryEmoji(schema, entry.id, v))}
            trigger={<Icon value={entry.emoji} size={40} />}
          />
          <input
            key={entry.id + entry.label}
            defaultValue={entry.label}
            aria-label="Nom de la catégorie"
            onBlur={(e) => {
              const name = e.target.value.trim()
              if (name && name !== entry.label) save(renameEntry(schema, entry.id, name))
              else e.target.value = entry.label
            }}
            className="min-w-0 flex-1 bg-transparent py-1 text-3xl font-bold leading-[1.3] outline-none"
          />
          <button
            className={button}
            title={entry.isNone ? 'Mettre ces recettes à la corbeille' : 'Supprimer la catégorie (ses recettes ne sont pas supprimées)'}
            onClick={() => confirmRemove(entry)}
          >
            <Trash2 size={16} />
          </button>
        </div>
        <label className="mb-3 flex items-center gap-2 text-sm text-[var(--fg-muted)]">
          Trier par
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as RecipeSort)}
            aria-label="Trier les recettes"
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--fg)] outline-none"
          >
            {RECIPE_SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <div className="grid items-start gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {list.map((row) => <RecipeCard key={row.id} row={row} />)}
          <button
            onClick={() => create(entry.isNone ? undefined : entry.id)}
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
  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="flex-1 py-1 text-4xl font-bold leading-[1.3]">Recettes</h1>
        <button className={button} onClick={() => setAssistant('recipe')} title="Écrire la recette à partir d'une vidéo YouTube ou d'un texte collé">✨ Depuis une vidéo ou un texte</button>
        <button className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-white" onClick={() => setChoosing(true)}>+ Nouvelle recette</button>
      </div>

      <nav aria-label="Catégories de recettes">
        {entries.map((e) => {
          const menuOpen = menu?.id === e.id
          return (
            // Même ligne que celles des pages : la ligne entière se surligne, et le bouton « ⋯ » apparaît à droite au survol.
            <div
              key={e.id}
              className={'group relative flex items-center gap-1 rounded py-1 pl-2 pr-1 hover:bg-[var(--bg-hover)] ' + (menuOpen ? 'bg-[var(--bg-hover)]' : '')}
              onContextMenu={(ev) => { ev.preventDefault(); setMenu({ id: e.id, x: ev.clientX, y: ev.clientY }) }}
            >
              {renaming === e.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Icon value={e.emoji} size={20} />
                  <input
                    autoFocus
                    defaultValue={e.label}
                    aria-label="Nom de la catégorie"
                    onFocus={(ev) => ev.currentTarget.select()}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') ev.currentTarget.blur()
                      if (ev.key === 'Escape') { ev.currentTarget.value = e.label; ev.currentTarget.blur() }
                    }}
                    onBlur={(ev) => {
                      const name = ev.target.value.trim()
                      if (name && name !== e.label) save(renameEntry(schema, e.id, name))
                      setRenaming(null)
                    }}
                    className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none"
                  />
                </div>
              ) : (
                <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => setCurrent(e.id)}>
                  {emojiFor === e.id ? (
                    <span onClick={(ev) => ev.stopPropagation()}>
                      <IconPicker
                        startOpen
                        value={e.emoji}
                        onChange={(v) => v && save(setEntryEmoji(schema, e.id, v))}
                        onClosed={() => setEmojiFor(null)}
                        trigger={<Icon value={e.emoji} size={20} />}
                      />
                    </span>
                  ) : (
                    <Icon value={e.emoji} size={20} />
                  )}
                  <span className={'truncate text-base font-medium ' + (e.isNone ? 'text-[var(--fg-muted)]' : 'underline decoration-[var(--border)] underline-offset-4')}>{e.label}</span>
                </button>
              )}
              {/* Le nombre laisse la place au bouton « ⋯ » dès qu'on survole la ligne ou que son menu est ouvert. */}
              <span className={'text-xs text-[var(--fg-muted)] group-hover:hidden ' + (menuOpen ? 'hidden' : '')}>{countOf(e)}</span>
              <button
                title="Plus d'actions"
                aria-label={`Options de ${e.label}`}
                onClick={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); setMenu({ id: e.id, x: r.left, y: r.bottom + 4 }) }}
                className={'rounded p-0.5 hover:bg-[var(--border)] group-hover:opacity-100 ' + (menuOpen ? 'opacity-100' : 'opacity-0')}
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          )
        })}
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

      {menu && (() => {
        const e = entries.find((x) => x.id === menu.id)
        if (!e) return null
        const index = entries.findIndex((x) => x.id === e.id)
        const item = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent'
        const run = (fn: () => void) => () => { setMenu(null); fn() }
        const moveAll = (categoryId: string) => {
          setMenu(null)
          void Promise.all(none.map((r) => setCell(r.id, RECIPE.type, categoryId)))
        }
        return (
          <>
            <div className="fixed inset-0 z-40" onMouseDown={() => setMenu(null)} onContextMenu={(ev) => { ev.preventDefault(); setMenu(null) }} />
            <div role="menu" className="fixed z-50 max-h-[70vh] w-64 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-xl" style={{ left: Math.min(menu.x, window.innerWidth - 270), top: Math.min(menu.y, window.innerHeight - (e.isNone ? 460 : 220)) }}>
              <button role="menuitem" className={item} onClick={run(() => setRenaming(e.id))}><PenLine size={14} /> Renommer</button>
              <button role="menuitem" className={item} onClick={run(() => setEmojiFor(e.id))}><Smile size={14} /> Changer l’emoji</button>
              <button role="menuitem" className={item} disabled={index === 0} onClick={run(() => save(moveEntry(schema, e.id, -1)))}><ArrowUp size={14} /> Monter</button>
              <button role="menuitem" className={item} disabled={index === entries.length - 1} onClick={run(() => save(moveEntry(schema, e.id, 1)))}><ArrowDown size={14} /> Descendre</button>
              <div className="my-1 border-t border-[var(--border)]" />
              <button role="menuitem" className={item + ' text-red-500'} onClick={run(() => confirmRemove(e))}><Trash2 size={14} /> Supprimer</button>
              {e.isNone && (
                <>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <div className="px-2 py-1 text-xs font-medium text-[var(--fg-muted)]">Ranger les {none.length} recette{none.length > 1 ? 's' : ''} dans…</div>
                  {categories.map((c) => (
                    <button key={c.id} role="menuitem" className={item} onClick={() => moveAll(c.id)}><Icon value={c.emoji} size={16} /> {c.label}</button>
                  ))}
                </>
              )}
            </div>
          </>
        )
      })()}
    </div>
  )
}
