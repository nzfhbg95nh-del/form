import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Info, Search, X } from 'lucide-react'
import { parseContent } from '@/lib/content'
import { parseValues } from '@/lib/database'
import { FoodIndex, loadFoods, percentOf, recipeNutrition, REFERENCES, type CiqualData, type Food, type IngredientNutrition, type Reference } from '@/lib/nutrition'
import { RECIPE } from '@/lib/recipes'
import { ingredientKey, shoppingLines } from '@/lib/shoppingList'
import type { ObjectRow } from '@/lib/types'
import { useApp } from '@/store/app'

export const NUTRITION_MATCHES_SETTING = 'nutrition_matches'

// La table Ciqual (≈ 640 Ko) n'est chargée qu'à la première recette ouverte, puis gardée.
let indexPromise: Promise<FoodIndex> | null = null
export function getFoodIndex(): Promise<FoodIndex> {
  indexPromise ??= import('@/data/ciqual2020.json').then((m) => new FoodIndex(loadFoods(m.default as unknown as CiqualData)))
  return indexPromise
}

export function parseMatches(raw: string | null | undefined): Record<string, number | null> {
  try {
    const d = raw ? JSON.parse(raw) : null
    if (!d || typeof d !== 'object') return {}
    const out: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(d)) if (v === null || typeof v === 'number') out[k] = v as number | null
    return out
  } catch {
    return {}
  }
}

const fmt = (v: number, unit: string) => {
  const n = v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100
  return `${String(n).replace('.', ',')} ${unit}`
}

function Bar({ pct, max }: { pct: number; max?: boolean }) {
  const over = max ? pct > 100 : false
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: over ? '#d44c47' : max ? '#d9730d' : '#2383e2' }} />
    </div>
  )
}

const HOW: Record<IngredientNutrition['match']['how'], { label: string; color: string }> = {
  alias: { label: 'reconnu', color: '#448361' },
  manual: { label: 'choisi par toi', color: '#2383e2' },
  search: { label: 'à vérifier', color: '#d9730d' },
  none: { label: 'non reconnu', color: '#d44c47' },
  ignored: { label: 'non compté', color: 'var(--fg-muted)' },
}

/** Choisir l'aliment Ciqual d'un ingrédient (recherche), ou « ne pas compter ». */
function FoodPicker({ index, initial, onPick, onClose }: { index: FoodIndex; initial: string; onPick: (f: Food | null) => void; onClose: () => void }) {
  const [q, setQ] = useState(initial)
  const results = useMemo(() => (q.trim().length >= 2 ? index.search(q, 12) : []), [index, q])
  return (
    <div className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 shadow-lg">
      <div className="mb-1 flex items-center gap-2 rounded-md px-2 py-1" style={{ background: 'color-mix(in srgb, var(--fg) 6%, transparent)' }}>
        <Search size={13} className="shrink-0 text-[var(--fg-muted)]" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onClose()} aria-label="Chercher un aliment" placeholder="Chercher un aliment (ex. tofu fumé)…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <button aria-label="Fermer" onClick={onClose} className="text-[var(--fg-muted)]"><X size={13} /></button>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {results.map((f) => <button key={f.code} className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-[var(--bg-hover)]" onClick={() => onPick(f)}>{f.name}</button>)}
        {q.trim().length >= 2 && results.length === 0 && <div className="px-2 py-1 text-sm text-[var(--fg-muted)]">Aucun aliment trouvé.</div>}
      </div>
      <button className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]" onClick={() => onPick(null)}>Ne pas compter cet ingrédient</button>
    </div>
  )
}

/**
 * « Infos nutritionnelles » d'une recette, pour une personne : énergie, macronutriments, fibres, oméga-3/6, sel, fer, zinc, calcium,
 * vitamines… en % d'un repère journalier adulte. Chaque ingrédient est relié à un aliment de la table Ciqual (ANSES) ; on peut corriger.
 */
export function RecipeNutritionPanel({ page }: { page: ObjectRow }) {
  const repo = useApp((s) => s.repo)
  const [index, setIndex] = useState<FoodIndex | null>(null)
  const [manual, setManual] = useState<Record<string, number | null>>({})
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [useOriginal, setUseOriginal] = useState(false)

  useEffect(() => {
    if (!open || index) return
    void getFoodIndex().then(setIndex)
  }, [open, index])
  useEffect(() => {
    void (repo?.getSetting(NUTRITION_MATCHES_SETTING) ?? Promise.resolve(null)).then((raw) => setManual(parseMatches(raw)))
  }, [repo])

  const blocks = useMemo(() => parseContent(page.content) ?? [], [page.content])
  const read = useMemo(() => shoppingLines(blocks, !useOriginal), [blocks, useOriginal])
  const hasVariant = useMemo(() => shoppingLines(blocks, true).variant, [blocks])
  const servings = read.servings ?? (Number(parseValues(page.properties)[RECIPE.servings]) || 4)
  const result = useMemo(() => (index && read.lines.length > 0 ? recipeNutrition(read.lines, servings, index, manual) : null), [index, read.lines, servings, manual])

  const choose = async (line: IngredientNutrition, food: Food | null) => {
    const key = ingredientKey(line.name || line.line)
    const next = { ...manual, [key]: food ? food.code : null }
    setManual(next)
    setEditing(null)
    await repo?.setSetting(NUTRITION_MATCHES_SETTING, JSON.stringify(next))
  }

  if (read.lines.length === 0 && !open) return null

  const cell = (ref: Reference) => {
    const v = result?.perServing[ref.key]
    const pct = percentOf(v, ref)
    const partial = result?.partial.has(ref.key)
    return (
      <div key={ref.key} className={'py-1 ' + (ref.label.startsWith('dont') ? 'pl-3' : '')}>
        <div className="flex items-baseline gap-2 text-sm">
          <span className={ref.label.startsWith('dont') ? 'text-[var(--fg-muted)]' : 'font-medium'}>{ref.label}</span>
          {pct !== null && <span className="text-xs text-[var(--fg-muted)]">{pct} %</span>}
          <span className="ml-auto tabular-nums text-xs text-[var(--fg-muted)]" title={partial ? 'Au moins un ingrédient n’a pas cette valeur dans la table : le total est un minimum.' : undefined}>
            {v === undefined ? '—' : `${partial ? '≥ ' : ''}${fmt(v, ref.unit)}`} / {fmt(ref.daily, ref.unit)}{ref.max ? ' max' : ''}
          </span>
        </div>
        {pct !== null && <Bar pct={pct} max={ref.max} />}
      </div>
    )
  }

  return (
    <section data-ui className="mt-8 rounded-xl border border-[var(--border)]" aria-label="Infos nutritionnelles">
      <button className="flex w-full items-center gap-2 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="text-base font-semibold">Infos nutritionnelles</span>
        <span className="ml-auto text-xs text-[var(--fg-muted)]">pour 1 personne</span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-4 pb-3 pt-2">
          {!index && <p className="py-3 text-sm text-[var(--fg-muted)]">Chargement de la table Ciqual…</p>}
          {index && read.lines.length === 0 && <p className="py-3 text-sm text-[var(--fg-muted)]">Cette recette n’a pas encore de liste d’ingrédients.</p>}
          {index && result && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--fg-muted)]">
                <span>Recette pour {servings} personne{servings > 1 ? 's' : ''}{read.variant ? ' · version sans viande' : ''}</span>
                {hasVariant && (
                  <button className="rounded border border-[var(--border)] px-1.5 py-0.5 hover:bg-[var(--bg-hover)]" onClick={() => setUseOriginal((u) => !u)}>
                    {useOriginal ? 'Voir la version sans viande' : 'Voir la recette d’origine'}
                  </button>
                )}
              </div>
              <div className="mb-3">{cell(REFERENCES[0])}</div>
              <div className="grid gap-x-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                {REFERENCES.slice(1).map(cell)}
              </div>
              {(result.unknown.length > 0 || result.noQuantity.length > 0) && (
                <p className="mt-3 rounded-lg bg-[var(--bg-side)] px-3 py-2 text-xs text-[var(--fg-muted)]">
                  {result.counted} ingrédient{result.counted > 1 ? 's' : ''} compté{result.counted > 1 ? 's' : ''}.
                  {result.noQuantity.length > 0 && ` Sans quantité (non comptés) : ${result.noQuantity.join(', ')}.`}
                  {result.unknown.length > 0 && ` Non reconnus : ${result.unknown.join(', ')} — tu peux les relier ci-dessous.`}
                </p>
              )}
              <button className="mt-3 flex items-center gap-1 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]" onClick={() => setDetails((d) => !d)}>
                {details ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Détail des ingrédients
              </button>
              {details && (
                <ul className="mt-1 space-y-0.5">
                  {result.ingredients.map((ing, i) => {
                    const how = ing.match.food === null && ing.match.how !== 'ignored' ? 'none' : ing.match.how
                    return (
                      <li key={i} className="rounded-md px-2 py-1 text-sm hover:bg-[var(--bg-hover)]">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="min-w-0 flex-1">{ing.line}</span>
                          <span className="text-xs tabular-nums text-[var(--fg-muted)]">{ing.grams === null ? 'quantité ?' : `≈ ${Math.round(ing.grams)} g`}</span>
                          <span className="text-xs" style={{ color: HOW[how].color }}>{HOW[how].label}</span>
                          <button className="text-xs text-[var(--fg-muted)] underline-offset-2 hover:underline" onClick={() => setEditing(editing === ing.line ? null : ing.line)}>Changer</button>
                        </div>
                        {ing.match.food && <div className="text-xs text-[var(--fg-muted)]">→ {ing.match.food.name}</div>}
                        {editing === ing.line && <FoodPicker index={index} initial={ing.name} onClose={() => setEditing(null)} onPick={(f) => void choose(ing, f)} />}
                      </li>
                    )
                  })}
                </ul>
              )}
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-4 text-[var(--fg-muted)]">
                <Info size={12} className="mt-0.5 shrink-0" />
                Source : Anses, table de composition nutritionnelle Ciqual 2020. Repères pour un adulte (ANSES, EFSA). Valeurs indicatives : les quantités sont estimées et la cuisson n’est pas prise en compte. Ce n’est pas un avis médical.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
