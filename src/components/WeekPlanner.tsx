import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Minus, Plus, Repeat, Search, Trash2, X } from 'lucide-react'
import { recipePhotoStyle } from '@/components/RecipeCard'
import { ShoppingList } from '@/components/ShoppingList'
import { MealPrepView } from '@/components/MealPrepView'
import { NutritionView } from '@/components/NutritionView'
import { prepSlots, readSteps, type CandidateRecipe } from '@/lib/mealPrep'
import { mealSuggestions } from '@/lib/kitchenIdeas'
import { DishPicker } from '@/components/DishPicker'
import { RECIPE } from '@/lib/recipes'
import { MyMealPreps } from '@/components/MyMealPreps'
import { Icon } from '@/components/Icon'
import { useLibrary } from '@/biblio/store/library.ts'
import { askConfirm } from '@/lib/confirm'
import { newId, parseValues } from '@/lib/database'
import { dishTitle } from '@/lib/vegTitle'
import { displayTitle } from '@/lib/lastEdit'
import {
  addEntry, addWithLeftovers, clearWeek, copyEntry, copyWeek, duplicateToNext, DAY_NAMES, dropMissingRecipes, emptyPlan, entriesAt, MEAL_PLAN_SETTING, MEALS, moveEntry, parsePlan, removeEntry, serializePlan, setServings, shiftWeek,
  weekDays, weekKey, weekLabel, weekStats, type Meal, type MealPlan, type PlanEntry,
} from '@/lib/mealPlan'
import { parseContent } from '@/lib/content'
import { monthName, recipeSeason, seasonScore, type SeasonInfo } from '@/lib/seasons'
import { shoppingLines } from '@/lib/shoppingList'
import { normalize } from '@/lib/search'
import type { ObjectRow } from '@/lib/types'
import { useApp } from '@/store/app'

const RECIPE_MIME = 'application/x-form-recipe'
const ENTRY_MIME = 'application/x-form-plan-entry'

/** Victor cuisine pour lui seul : un repas ajouté compte 1 personne (réglable repas par repas). */
const DEFAULT_PEOPLE = 1

export type PlannerTab = 'plan' | 'courses' | 'prep' | 'nutrition'

function Thumb({ row, size = 28 }: { row: ObjectRow | undefined; size?: number }) {
  const style = row ? recipePhotoStyle(row) : undefined
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--bg-side)]" style={{ width: size, height: size, ...style }}>
      {!style && <Icon value={row?.icon && row.icon !== '🍳' ? row.icon : '🍽️'} size={Math.round(size * 0.6)} />}
    </span>
  )
}

/**
 * Le planning des repas de la semaine : 7 jours × midi / soir. On y glisse les recettes de la colonne de gauche (ou « + » dans une case),
 * on règle le nombre de personnes de chaque repas, on déplace un repas d'une case à l'autre en le glissant.
 */
export function WeekPlanner({ rows, tab, onTab }: { rows: ObjectRow[]; tab: PlannerTab; onTab: (t: PlannerTab) => void }) {
  const repo = useApp((s) => s.repo)
  const select = useApp((s) => s.select)
  useLibrary((s) => s.root + s.ready) // les photos rangées dans la bibliothèque s'affichent une fois son dossier connu
  const [plan, setPlan] = useState<MealPlan>(emptyPlan)
  const [loaded, setLoaded] = useState(false)
  const [week, setWeek] = useState(() => weekKey(new Date()))
  const [query, setQuery] = useState('')
  const [picker, setPicker] = useState<{ day: number; meal: Meal; x: number; y: number } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // Onglet affiché : le planning ou la liste de courses de la semaine.
  const setTab = onTab
  const [prepPart, setPrepPart] = useState<'week' | 'mine'>('week')
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  // Lecture une fois ; les repas dont la recette a été supprimée sont retirés.
  useEffect(() => {
    let stop = false
    void (repo?.getSetting(MEAL_PLAN_SETTING) ?? Promise.resolve(null)).then((raw) => {
      if (stop) return
      setPlan(parsePlan(raw))
      setLoaded(true)
    })
    return () => { stop = true }
  }, [repo])
  useEffect(() => {
    if (loaded && rows.length > 0) setPlan((p) => dropMissingRecipes(p, (id) => byId.has(id)))
  }, [loaded, rows.length, byId])

  // Enregistrement peu après chaque changement.
  const saved = useRef<string | null>(null)
  useEffect(() => {
    if (!loaded || !repo) return
    const text = serializePlan(plan)
    if (saved.current === null) { saved.current = text; return }
    if (text === saved.current) return
    const t = window.setTimeout(() => { saved.current = text; void repo.setSetting(MEAL_PLAN_SETTING, text) }, 300)
    return () => window.clearTimeout(t)
  }, [plan, loaded, repo])

  const days = weekDays(week)
  const today = new Date()
  const isToday = (d: Date) => d.toDateString() === today.toDateString()
  const stats = weekStats(plan, week)
  // La saison de la semaine affichée (le mois de son jeudi) et celle de chaque recette.
  const weekMonth = days[3].getMonth() + 1
  const seasonById = useMemo(() => {
    const m = new Map<string, SeasonInfo>()
    for (const r of rows) m.set(r.id, recipeSeason(shoppingLines(parseContent(r.content) ?? []).lines, weekMonth))
    return m
  }, [rows, weekMonth])
  const candidates = useMemo((): CandidateRecipe[] => rows.map((row) => {
    const blocks = parseContent(row.content) ?? []
    const t = parseValues(row.properties)[RECIPE.type]
    return { id: row.id, title: dishTitle(row), lines: shoppingLines(blocks).lines, steps: readSteps(blocks).steps, type: typeof t === 'string' ? t : null }
  }), [rows])
  const [seasonFirst, setSeasonFirst] = useState(true)
  // « Je cuisine pour N repas » dans la fenêtre de choix (les restes vont dans les repas libres suivants).
  const [repeat, setRepeat] = useState(1)
  const sideList = useMemo(() => {
    const nq = normalize(query)
    const byName = (a: ObjectRow, b: ObjectRow) => dishTitle(a).localeCompare(dishTitle(b), 'fr')
    const score = (r: ObjectRow) => { const s = seasonById.get(r.id); return s ? seasonScore(s) : 0 }
    return [...rows].filter((r) => normalize(`${dishTitle(r)} ${displayTitle(r.title)}`).includes(nq)).sort((a, b) => (seasonFirst ? score(b) - score(a) : 0) || byName(a, b))
  }, [rows, query, seasonById, seasonFirst])

  const add = (day: number, meal: Meal, recipeId: string) => setPlan((p) => addEntry(p, week, day, meal, recipeId, DEFAULT_PEOPLE, newId()))

  const onDrop = (e: React.DragEvent, day: number, meal: Meal, beforeId: string | null = null) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(null)
    const entryId = e.dataTransfer.getData(ENTRY_MIME)
    const recipeId = e.dataTransfer.getData(RECIPE_MIME)
    // Ctrl (ou Alt) en lâchant : le repas est recopié au lieu d'être déplacé.
    if (entryId && (e.ctrlKey || e.altKey)) setPlan((p) => copyEntry(p, week, entryId, week, day, meal, newId()))
    else if (entryId) setPlan((p) => moveEntry(p, week, entryId, day, meal, beforeId))
    else if (recipeId) add(day, meal, recipeId)
  }
  const accepts = (e: React.DragEvent) => e.dataTransfer.types.includes(RECIPE_MIME) || e.dataTransfer.types.includes(ENTRY_MIME)

  const copyPrevious = async () => {
    const prev = shiftWeek(week, -1)
    if ((plan.weeks[prev] ?? []).length === 0) return
    if (stats.meals > 0 && !(await askConfirm('Remplacer les repas de cette semaine par ceux de la semaine précédente ?'))) return
    setPlan((p) => copyWeek(p, prev, week, newId))
  }
  // Une idée de meal prep : ses trois recettes réparties sur la semaine (deux repas chacune du lundi au mercredi, puis jeudi et vendredi).
  const applyIdea = async (ids: string[], people: number) => {
    if (stats.meals > 0 && !(await askConfirm('Remplacer les repas de cette semaine par ce meal prep ?'))) return
    setPlan((p) => prepSlots(ids).reduce((acc, slot) => addEntry(acc, week, slot.day, slot.meal, slot.recipeId, people, newId()), clearWeek(p, week)))
    setTab('prep')
  }
  const clear = async () => {
    if (stats.meals === 0 || !(await askConfirm('Retirer tous les repas de cette semaine ? Les recettes ne sont pas supprimées.'))) return
    setPlan((p) => clearWeek(p, week))
  }

  const chip = (e: PlanEntry) => {
    const row = byId.get(e.recipeId)
    return (
      <div
        key={e.id}
        draggable
        onDragStart={(ev) => { ev.dataTransfer.setData(ENTRY_MIME, e.id); ev.dataTransfer.effectAllowed = 'copyMove' }}
        onDragOver={(ev) => { if (accepts(ev)) { ev.preventDefault(); ev.dataTransfer.dropEffect = ev.ctrlKey || ev.altKey ? 'copy' : 'move' } }}
        onDrop={(ev) => onDrop(ev, e.day, e.meal, e.id)}
        className="group relative cursor-grab overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)] text-xs shadow-[var(--shadow-soft)] active:cursor-grabbing"
        data-plan-entry={e.id}
      >
        {/* Comme une petite carte : la photo en bandeau, le titre sur toute la largeur (deux lignes au plus), puis le nombre de personnes. */}
        {row && recipePhotoStyle(row) && <div className="h-10 w-full" style={recipePhotoStyle(row)} />}
        {/* Un texte cliquable plutôt qu'un bouton : le navigateur ne laisse pas glisser une carte prise par un bouton. */}
        <span
          role="button"
          tabIndex={0}
          className="line-clamp-2 w-full cursor-pointer px-1.5 pt-1 text-left font-medium leading-tight hover:underline"
          title={(row ? dishTitle(row) : "")}
          onClick={() => row && select(row.id)}
          onKeyDown={(ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && row) { ev.preventDefault(); select(row.id) } }}
        >
          {(row ? dishTitle(row) : "")}
        </span>
        {e.leftoverOf && <div className="flex items-center gap-0.5 px-1.5 text-[10px] font-medium" style={{ color: '#448361' }} title="Restes : rien à cuisiner, le plat a été préparé pour un repas d'avant"><Repeat size={10} /> restes</div>}
        <div className="flex items-center gap-1 px-1.5 pb-1 pt-0.5 text-[var(--fg-muted)]" title="Nombre de personnes">
          <button type="button" aria-label="Une personne de moins" className="rounded px-0.5 hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]" onClick={() => setPlan((p) => setServings(p, week, e.id, e.servings - 1))}><Minus size={11} /></button>
          <span className="tabular-nums" aria-label={`${e.servings} personnes`}>{e.servings} pers.</span>
          <button type="button" aria-label="Une personne de plus" className="rounded px-0.5 hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]" onClick={() => setPlan((p) => setServings(p, week, e.id, e.servings + 1))}><Plus size={11} /></button>
        </div>
        <div className="absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100">
          <button type="button" aria-label="Dupliquer au repas suivant (restes)" title="Remanger au prochain repas libre (restes)" className="rounded bg-[var(--bg)] p-px text-[var(--fg-muted)] hover:text-[var(--fg)]" onClick={() => setPlan((p) => duplicateToNext(p, week, e.id, newId()))}><Copy size={12} /></button>
          <button type="button" aria-label="Retirer ce repas" className="rounded bg-[var(--bg)] text-[var(--fg-muted)] hover:text-[var(--fg)]" onClick={() => setPlan((p) => removeEntry(p, week, e.id))}><X size={13} /></button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto py-1 text-3xl font-bold leading-[1.3]">{weekLabel(week)}</h1>
        <button className="btn !px-2" aria-label="Semaine précédente" onClick={() => setWeek((w) => shiftWeek(w, -1))}><ChevronLeft size={16} /></button>
        <button className="btn" onClick={() => setWeek(weekKey(new Date()))} disabled={week === weekKey(new Date())}>Cette semaine</button>
        <button className="btn !px-2" aria-label="Semaine suivante" onClick={() => setWeek((w) => shiftWeek(w, 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-[var(--fg-muted)]">
        <span className="mr-auto">
          {stats.meals === 0 ? 'Aucun repas prévu : glisse une recette dans une case, ou clique sur « + ».' : `${stats.meals} repas · ${stats.recipes} recette${stats.recipes > 1 ? 's' : ''} · ${stats.servings} portions`}
        </span>
        <button className="btn !text-sm" onClick={() => void copyPrevious()} disabled={(plan.weeks[shiftWeek(week, -1)] ?? []).length === 0} title="Reprendre les repas de la semaine précédente"><Copy size={14} /> Copier la semaine précédente</button>
        <button className="btn !text-sm" onClick={() => void clear()} disabled={stats.meals === 0}><Trash2 size={14} /> Vider</button>
      </div>

      {tab === 'courses' ? (
        <div className="min-h-0 flex-1 overflow-y-auto"><ShoppingList plan={plan} week={week} byId={byId} /></div>
      ) : tab === 'nutrition' ? (
        <div className="min-h-0 flex-1 overflow-y-auto"><NutritionView plan={plan} week={week} byId={byId} rows={rows} /></div>
      ) : tab === 'prep' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Deux parties : la séance de cuisine de cette semaine, et les meal preps composés et enregistrés par Victor. */}
          <div role="tablist" className="mb-4 flex w-fit rounded-lg p-0.5" style={{ background: 'color-mix(in srgb, var(--fg) 6%, transparent)' }}>
            {([['week', 'Cette semaine'], ['mine', 'Mes meal preps']] as const).map(([id, l]) => (
              <button key={id} role="tab" aria-selected={prepPart === id} onClick={() => setPrepPart(id)} className={'rounded-md px-3 py-1 text-sm ' + (prepPart === id ? 'bg-[var(--bg)] font-medium shadow-sm' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]')}>{l}</button>
            ))}
          </div>
          {prepPart === 'week'
            ? <MealPrepView plan={plan} week={week} byId={byId} rows={rows} onUseIdea={(ids, people) => void applyIdea(ids, people)} />
            : <MyMealPreps rows={rows} byId={byId} onUse={(ids, people) => { setPrepPart('week'); void applyIdea(ids, people) }} />}
        </div>
      ) : (
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Les recettes, à glisser dans les cases. */}
        <aside className="flex w-48 shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--border)]" aria-label="Recettes à planifier">
          <label className="m-2 flex items-center gap-2 rounded-md px-2 py-1.5" style={{ background: 'color-mix(in srgb, var(--fg) 6%, transparent)' }}>
            <Search size={14} className="shrink-0 text-[var(--fg-muted)]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher…" aria-label="Chercher une recette à planifier" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-muted)]" />
          </label>
          <label className="mx-2 mb-1 flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
            <input type="checkbox" checked={seasonFirst} onChange={(e) => setSeasonFirst(e.target.checked)} />
            De saison d’abord ({monthName(weekMonth)})
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
            {sideList.map((r) => (
              <div
                key={r.id}
                draggable
                onDragStart={(ev) => { ev.dataTransfer.setData(RECIPE_MIME, r.id); ev.dataTransfer.effectAllowed = 'copy' }}
                className="flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-[var(--bg-hover)] active:cursor-grabbing"
                title="Glisser dans une case du planning"
                data-plan-recipe={r.id}
              >
                <Thumb row={r} size={26} />
                <span className="min-w-0 flex-1 truncate">{dishTitle(r)}</span>
                {(() => {
                  // Un point vert : de saison ; orange : des produits frais hors saison (le détail au survol).
                  const s = seasonById.get(r.id)
                  if (!s || (s.inSeason.length === 0 && s.outOfSeason.length === 0)) return null
                  const off = s.outOfSeason.length > 0
                  return <span aria-label={off ? `Hors saison : ${s.outOfSeason.join(', ')}` : `De saison : ${s.inSeason.join(', ')}`} title={off ? `Hors saison en ${monthName(weekMonth)} : ${s.outOfSeason.join(', ')}` : `De saison : ${s.inSeason.join(', ')}`} className="h-2 w-2 shrink-0 rounded-full" style={{ background: off ? '#d9730d' : '#448361' }} />
                })()}
              </div>
            ))}
            {sideList.length === 0 && <p className="px-2 py-2 text-sm text-[var(--fg-muted)]">Aucune recette</p>}
          </div>
        </aside>

        {/* La grille : 7 jours × midi / soir. */}
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="grid min-w-[840px] gap-2" style={{ gridTemplateColumns: '3.5rem repeat(7, minmax(0, 1fr))' }}>
            <div />
            {days.map((d, i) => (
              <div key={i} className={'rounded-md px-2 py-1 text-center text-sm ' + (isToday(d) ? 'bg-[var(--accent-soft,rgba(35,131,226,0.12))] font-semibold' : 'text-[var(--fg-muted)]')}>
                <div className="font-medium">{DAY_NAMES[i]}</div>
                <div className="text-xs">{d.getDate()}/{d.getMonth() + 1}</div>
              </div>
            ))}
            {MEALS.map((m) => (
              <div key={m.id} className="contents">
                <div className="pt-2 text-right text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">{m.label}</div>
                {days.map((_, day) => {
                  const cell = `${day}-${m.id}`
                  const list = entriesAt(plan, week, day, m.id)
                  return (
                    <div
                      key={cell}
                      data-plan-cell={cell}
                      onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); setOver(cell) } }}
                      onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver((o) => (o === cell ? null : o)) }}
                      onDrop={(e) => onDrop(e, day, m.id)}
                      className={'group/cell flex min-h-[7rem] flex-col gap-1 rounded-lg border p-1 transition-colors ' + (over === cell ? 'border-[#2383e2] bg-[rgba(35,131,226,0.08)]' : 'border-[var(--border)] bg-[var(--bg-side)]')}
                    >
                      {list.map(chip)}
                      <button
                        type="button"
                        aria-label={`Ajouter une recette ${DAY_NAMES[day].toLowerCase()} ${m.label.toLowerCase()}`}
                        className={'mt-auto flex items-center justify-center gap-1 rounded-md py-1 text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)] ' + (list.length > 0 ? 'opacity-0 group-hover/cell:opacity-100' : '')}
                        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPicker({ day, meal: m.id, x: r.left, y: r.bottom + 4 }) }}
                      >
                        <Plus size={13} /> {list.length === 0 ? 'Ajouter' : ''}
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {picker && (() => {
        // Les plats proposés pour ce repas : de saison, une autre protéine que le reste de la journée, des ingrédients déjà achetés.
        const weekIds = [...new Set((plan.weeks[week] ?? []).map((e) => e.recipeId))]
        const sameDay = (plan.weeks[week] ?? []).filter((e) => e.day === picker.day).map((e) => e.recipeId)
        return (
          <DishPicker
            rows={rows}
            title={`Ajouter un plat : ${DAY_NAMES[picker.day].toLowerCase()} ${picker.meal}`}
            subtitle={days[picker.day].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
            suggestions={mealSuggestions(candidates, days[picker.day], weekIds, sameDay)}
            again={weekIds}
            header={
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-[var(--fg-muted)]">Je cuisine pour</span>
                <div role="radiogroup" aria-label="Nombre de repas" className="flex rounded-lg p-0.5" style={{ background: 'color-mix(in srgb, var(--fg) 6%, transparent)' }}>
                  {[1, 2, 3, 4].map((n) => <button key={n} role="radio" aria-checked={repeat === n} onClick={() => setRepeat(n)} className={'rounded-md px-2.5 py-0.5 ' + (repeat === n ? 'bg-[var(--bg)] font-medium shadow-sm' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]')}>{n} repas</button>)}
                </div>
                {repeat > 1 && <span className="text-xs text-[var(--fg-muted)]">les {repeat - 1} repas libres suivants reçoivent les restes</span>}
              </div>
            }
            onClose={() => setPicker(null)}
            onPick={(id) => setPlan((p) => addWithLeftovers(p, week, picker.day, picker.meal, id, DEFAULT_PEOPLE, repeat, newId))}
          />
        )
      })()}
    </div>
  )
}
