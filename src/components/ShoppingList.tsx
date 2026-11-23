import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ClipboardCopy, Plus, X } from 'lucide-react'
import { parseContent } from '@/lib/content'
import { newId, parseValues } from '@/lib/database'
import { displayTitle } from '@/lib/lastEdit'
import type { MealPlan } from '@/lib/mealPlan'
import { RECIPE } from '@/lib/recipes'
import { AISLES, buildShoppingList, parseShopping, SHOPPING_SETTING, shoppingLines, shoppingText, type ShoppingSource, type WeekShopping } from '@/lib/shoppingList'
import type { ObjectRow } from '@/lib/types'
import { copyText } from '@/lib/windowActions'
import { useApp } from '@/store/app'

const EMPTY: WeekShopping = { checked: [], extra: [] }

/**
 * La liste de courses d'une semaine du planning : les ingrédients de toutes les recettes prévues, additionnés et mis au bon nombre
 * de personnes, rangés par rayon. On coche ce qu'on a déjà ou ce qu'on a acheté ; on ajoute des articles à la main ; on copie la liste.
 */
export function ShoppingList({ plan, week, byId }: { plan: MealPlan; week: string; byId: Map<string, ObjectRow> }) {
  const repo = useApp((s) => s.repo)
  const select = useApp((s) => s.select)
  const [all, setAll] = useState<Record<string, WeekShopping>>({})
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let stop = false
    void (repo?.getSetting(SHOPPING_SETTING) ?? Promise.resolve(null)).then((raw) => {
      if (stop) return
      setAll(parseShopping(raw))
      setLoaded(true)
    })
    return () => { stop = true }
  }, [repo])
  const saved = useRef<string | null>(null)
  useEffect(() => {
    if (!loaded || !repo) return
    const text = JSON.stringify(all)
    if (saved.current === null) { saved.current = text; return }
    if (text === saved.current) return
    const t = window.setTimeout(() => { saved.current = text; void repo.setSetting(SHOPPING_SETTING, text) }, 300)
    return () => window.clearTimeout(t)
  }, [all, loaded, repo])

  const mine = all[week] ?? EMPTY
  const update = (fn: (w: WeekShopping) => WeekShopping) => setAll((a) => ({ ...a, [week]: fn(a[week] ?? EMPTY) }))
  const checked = useMemo(() => new Set(mine.checked), [mine.checked])

  // Les recettes de la semaine, chacune avec son facteur (personnes prévues / personnes de la recette).
  const { items, variants, missing } = useMemo(() => {
    const sources: ShoppingSource[] = []
    const variantNames = new Set<string>()
    const empty = new Set<string>()
    for (const e of plan.weeks[week] ?? []) {
      const row = byId.get(e.recipeId)
      if (!row) continue
      const name = displayTitle(row.title)
      const read = shoppingLines(parseContent(row.content) ?? [])
      if (read.lines.length === 0) { empty.add(name); continue }
      if (read.variant) variantNames.add(name)
      const base = read.servings ?? (Number(parseValues(row.properties)[RECIPE.servings]) || null)
      sources.push({ recipe: name, lines: read.lines, factor: base ? e.servings / base : 1 })
    }
    return { items: buildShoppingList(sources), variants: [...variantNames], missing: [...empty] }
  }, [plan, week, byId])

  const toggle = (id: string) => update((w) => ({ ...w, checked: w.checked.includes(id) ? w.checked.filter((x) => x !== id) : [...w.checked, id] }))
  const addExtra = () => {
    const text = draft.trim()
    if (!text) return
    update((w) => ({ ...w, extra: [...w.extra, { id: newId(), text }] }))
    setDraft('')
  }
  const left = items.filter((i) => !checked.has(i.id)).length + mine.extra.filter((e) => !e.done).length
  const copy = async () => {
    await copyText(shoppingText(items, checked, mine.extra.filter((e) => !e.done)))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }
  const recipeIdByName = useMemo(() => new Map([...byId.values()].map((r) => [displayTitle(r.title), r.id])), [byId])

  if ((plan.weeks[week] ?? []).length === 0) {
    return <p className="rounded-xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--fg-muted)]">Aucun repas prévu cette semaine : ajoute des recettes dans le planning, la liste de courses se fera toute seule.</p>
  }

  const row = (key: string, text: string, done: boolean, onToggle: () => void, sub?: React.ReactNode, onRemove?: () => void) => (
    <li key={key} className="group flex items-start gap-2.5 rounded-md px-2 py-1 hover:bg-[var(--bg-hover)]">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Décocher ${text}` : `Cocher ${text}`}
        onClick={onToggle}
        className={'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ' + (done ? 'border-[#2383e2] bg-[#2383e2] text-white' : 'border-[var(--fg-muted)]')}
      >
        {done && <Check size={12} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={'text-sm ' + (done ? 'text-[var(--fg-muted)] line-through' : '')}>{text}</div>
        {sub}
      </div>
      {onRemove && <button type="button" aria-label={`Retirer ${text}`} className="text-[var(--fg-muted)] opacity-0 hover:text-[var(--fg)] group-hover:opacity-100" onClick={onRemove}><X size={14} /></button>}
    </li>
  )

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-[var(--fg-muted)]">{left === 0 ? 'Tout est coché : les courses sont faites !' : `${left} article${left > 1 ? 's' : ''} à acheter`}</p>
        <button className="btn !text-sm" onClick={() => void copy()}><ClipboardCopy size={14} /> {copied ? 'Copiée !' : 'Copier la liste'}</button>
      </div>
      {variants.length > 0 && (
        <p className="mb-3 rounded-lg bg-[var(--bg-side)] px-3 py-2 text-xs text-[var(--fg-muted)]">
          Version sans viande utilisée pour : {variants.join(', ')}.
        </p>
      )}
      {missing.length > 0 && (
        <p className="mb-3 rounded-lg bg-[var(--bg-side)] px-3 py-2 text-xs text-[var(--fg-muted)]">
          Sans liste d’ingrédients, donc absentes de la liste : {missing.join(', ')}.
        </p>
      )}
      {AISLES.map((aisle) => {
        const list = items.filter((i) => i.aisle === aisle)
        if (list.length === 0) return null
        return (
          <section key={aisle} className="mb-4">
            <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">{aisle}</h3>
            <ul>
              {list.map((i) =>
                row(i.id, i.text, checked.has(i.id), () => toggle(i.id), (
                  <div className="truncate text-xs text-[var(--fg-muted)]">
                    {i.recipes.map((name, k) => (
                      <span key={name}>
                        {k > 0 && ', '}
                        <button type="button" className="hover:underline" onClick={() => { const id = recipeIdByName.get(name); if (id) select(id) }}>{name}</button>
                      </span>
                    ))}
                  </div>
                )),
              )}
            </ul>
          </section>
        )
      })}
      <section className="mb-4">
        <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">En plus</h3>
        <ul>
          {mine.extra.map((e) =>
            row(e.id, e.text, !!e.done, () => update((w) => ({ ...w, extra: w.extra.map((x) => (x.id === e.id ? { ...x, done: !x.done } : x)) })), undefined, () => update((w) => ({ ...w, extra: w.extra.filter((x) => x.id !== e.id) }))),
          )}
        </ul>
        <form className="mt-1 flex items-center gap-2 px-2" onSubmit={(ev) => { ev.preventDefault(); addExtra() }}>
          <Plus size={14} className="shrink-0 text-[var(--fg-muted)]" />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ajouter un article (café, papier toilette…)" aria-label="Ajouter un article" className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-[var(--fg-muted)]" />
        </form>
      </section>
    </div>
  )
}
