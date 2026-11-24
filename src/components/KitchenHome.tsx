import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChefHat, Clock, Lightbulb, Sprout } from 'lucide-react'
import { ForageBanner } from '@/components/ForageBanner'
import { recipePhotoStyle } from '@/components/RecipeCard'
import { Icon } from '@/components/Icon'
import { useLibrary } from '@/biblio/store/library.ts'
import { parseContent } from '@/lib/content'
import { newId, parseValues } from '@/lib/database'
import { todayIdeas } from '@/lib/kitchenIdeas'
import { displayTitle } from '@/lib/lastEdit'
import { addEntry, entriesAt, MEAL_PLAN_SETTING, parsePlan, serializePlan, weekKey, type Meal, type MealPlan } from '@/lib/mealPlan'
import { prepMeals, readSteps, suggestIdeas, type CandidateRecipe } from '@/lib/mealPrep'
import { RECIPE } from '@/lib/recipes'
import { inSeasonNames, monthName } from '@/lib/seasons'
import { shoppingLines } from '@/lib/shoppingList'
import type { ObjectRow } from '@/lib/types'
import { useApp } from '@/store/app'

const dayIndex = (d: Date) => (d.getDay() + 6) % 7
const shortTitle = (t: string) => t.replace(/\s*\(.*\)\s*$/, '')
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 }
const dayLabel = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })

/**
 * L'accueil de la cuisine : la date du jour (elle décide de ce qui est de saison et à cueillir), les fruits et légumes du mois,
 * la cueillette autour de Tournai, des idées de plats pour aujourd'hui et des idées de meal prep (3 jours ou la semaine).
 */
export function KitchenHome({ rows, onGo }: { rows: ObjectRow[]; onGo: (tab: 'plan' | 'prep') => void }) {
  const repo = useApp((s) => s.repo)
  const select = useApp((s) => s.select)
  useLibrary((s) => s.root + s.ready) // les photos rangées dans la bibliothèque s'affichent une fois son dossier connu
  const today = useMemo(() => new Date(), [])
  const month = today.getMonth() + 1
  const date = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const season = inSeasonNames(month)
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  const [plan, setPlan] = useState<MealPlan | null>(null)
  useEffect(() => { void (repo?.getSetting(MEAL_PLAN_SETTING) ?? Promise.resolve(null)).then((raw) => setPlan(parsePlan(raw))) }, [repo])
  const savePlan = (next: MealPlan) => { setPlan(next); void repo?.setSetting(MEAL_PLAN_SETTING, serializePlan(next)) }

  const candidates = useMemo((): CandidateRecipe[] => rows.map((row) => {
    const blocks = parseContent(row.content) ?? []
    const t = parseValues(row.properties)[RECIPE.type]
    return { id: row.id, title: displayTitle(row.title), lines: shoppingLines(blocks).lines, steps: readSteps(blocks).steps, type: typeof t === 'string' ? t : null }
  }), [rows])

  // Les recettes déjà prévues cette semaine ne sont pas reproposées.
  const week = weekKey(today)
  // Calculées une fois le planning lu : une idée ajoutée reste affichée (« Ajouté ce soir ») au lieu de disparaître.
  const loaded = plan !== null
  const ideas = useMemo(() => (plan ? todayIdeas(candidates, today, new Set((plan.weeks[week] ?? []).map((e) => e.recipeId))) : []), [candidates, today, loaded, week]) // eslint-disable-line react-hooks/exhaustive-deps
  const [added, setAdded] = useState<Record<string, Meal>>({})
  const addToday = (id: string, meal: Meal) => {
    if (!plan) return
    savePlan(addEntry(plan, week, dayIndex(today), meal, id, 1, newId()))
    setAdded((a) => ({ ...a, [id]: meal }))
  }
  const todayMeals = plan ? (['midi', 'soir'] as Meal[]).map((m) => ({ meal: m, entries: entriesAt(plan, week, dayIndex(today), m) })) : []

  const [prepDays, setPrepDays] = useState<3 | 5>(3)
  const prepIdeas = useMemo(() => suggestIdeas(candidates, 3, month, prepDays === 3 ? 2 : 3), [candidates, month, prepDays])
  const [placed, setPlaced] = useState<string | null>(null)
  const startPrep = (ids: string[]) => {
    if (!plan) return
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    let next = plan
    let n = 0
    for (const m of prepMeals(ids, start, prepDays)) {
      const wk = weekKey(m.date)
      if (entriesAt(next, wk, dayIndex(m.date), m.meal).length > 0) continue // un repas déjà prévu n'est pas écrasé
      next = addEntry(next, wk, dayIndex(m.date), m.meal, m.recipeId, 1, newId())
      n++
    }
    savePlan(next)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + prepDays - 1)
    setPlaced(n === 0 ? `Du ${dayLabel(start)} au ${dayLabel(end)}, tous les repas sont déjà prévus : rien n’a été changé.` : `${n} repas placés du ${dayLabel(start)} au ${dayLabel(end)}${n < prepDays * 2 ? ' (les repas déjà prévus sont gardés)' : ''}.`)
  }

  const minutes = (id: string) => { const v = parseValues(byId.get(id)?.properties ?? '{}'); return num(v[RECIPE.prep]) + num(v[RECIPE.cook]) }
  const thumb = (id: string, h = 96) => {
    const row = byId.get(id)
    const style = row ? recipePhotoStyle(row) : undefined
    return <div className="flex w-full items-center justify-center bg-[var(--bg-side)]" style={{ height: h, ...style }}>{!style && <Icon value={row?.icon && row.icon !== '🍳' ? row.icon : '🍽️'} size={28} />}</div>
  }

  return (
    <div className="max-w-5xl">
      <h1 className="py-1 text-3xl font-bold leading-[1.3]">Cuisine</h1>
      <p className="mb-6 flex items-center gap-1.5 text-sm text-[var(--fg-muted)]"><CalendarDays size={14} /> Aujourd’hui : {date}</p>

      <section className="mb-8" aria-label="De saison">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><Sprout size={16} style={{ color: '#448361' }} /> De saison en {monthName(month)}</h2>
        {season.length === 0 ? <p className="text-sm text-[var(--fg-muted)]">Rien de noté pour ce mois.</p> : (
          <div className="flex flex-wrap gap-1.5">
            {season.map((n) => <span key={n} className="rounded-full px-2.5 py-0.5 text-sm" style={{ background: 'rgba(68,131,97,0.12)' }}>{n}</span>)}
          </div>
        )}
      </section>

      <section className="mb-8" aria-label="Cueillette">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><Sprout size={16} style={{ color: '#448361' }} /> À cueillir autour de Tournai</h2>
        <ForageBanner rows={rows} />
      </section>

      <section className="mb-8" aria-label="Idées pour aujourd'hui">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><Lightbulb size={16} /> Idées pour aujourd’hui</h2>
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          {todayMeals.map(({ meal, entries }) => `${meal === 'midi' ? 'Midi' : 'Soir'} : ${entries.length ? entries.map((e) => shortTitle(displayTitle(byId.get(e.recipeId)?.title ?? ''))).join(', ') : 'rien de prévu'}`).join(' · ')}
          {' · '}<button className="underline hover:text-[var(--fg)]" onClick={() => onGo('plan')}>ouvrir le planning</button>
        </p>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {ideas.map((i) => (
            <div key={i.id} className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)]">
              <button onClick={() => select(i.id)} aria-label={`Ouvrir ${i.title}`}>{thumb(i.id)}</button>
              <div className="flex flex-1 flex-col p-2.5">
                <button className="mb-0.5 text-left text-sm font-medium leading-snug hover:underline" onClick={() => select(i.id)}>{shortTitle(i.title)}</button>
                <div className="mb-2 text-xs text-[var(--fg-muted)]">
                  {minutes(i.id) > 0 && <span className="mr-1.5 inline-flex items-center gap-0.5"><Clock size={11} /> {minutes(i.id)} min</span>}
                  {i.inSeason.length > 0 && <span className="mr-1.5 rounded px-1 py-px" style={{ background: 'rgba(68,131,97,0.15)', color: '#448361' }}>de saison</span>}
                  {i.reasons.filter((r) => !r.startsWith('de saison')).join(' · ')}
                </div>
                <div className="mt-auto flex gap-1.5">
                  {added[i.id] ? <span className="flex items-center gap-1 text-xs" style={{ color: '#448361' }}><Check size={13} /> Ajouté {added[i.id] === 'midi' ? 'ce midi' : 'ce soir'}</span> : (['midi', 'soir'] as Meal[]).map((m) => (
                    <button key={m} className="btn !px-2 !py-0.5 !text-xs" onClick={() => addToday(i.id, m)}>{m === 'midi' ? 'Ce midi' : 'Ce soir'}</button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8" aria-label="Idées de meal prep">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold"><ChefHat size={16} /> Idées de meal prep</h2>
          <div role="tablist" className="flex rounded-lg p-0.5" style={{ background: 'color-mix(in srgb, var(--fg) 6%, transparent)' }}>
            {([3, 5] as const).map((d) => (
              <button key={d} role="tab" aria-selected={prepDays === d} onClick={() => { setPrepDays(d); setPlaced(null) }} className={'rounded-md px-2.5 py-0.5 text-sm ' + (prepDays === d ? 'bg-[var(--bg)] font-medium shadow-sm' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]')}>{d === 3 ? '3 jours' : 'La semaine (5 jours)'}</button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-sm text-[var(--fg-muted)]">{prepDays === 3 ? 'Deux plats' : 'Trois plats'} cuisinés en une fois, pour midi et soir à partir de demain.</p>
        {placed && <p className="mb-3 text-sm" style={{ color: '#448361' }}>{placed} <button className="underline" onClick={() => onGo('prep')}>Voir la séance de cuisine</button></p>}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {prepIdeas.map((idea) => (
            <div key={idea.ids.join()} className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)]">
              <div className="flex">{idea.ids.map((id) => <button key={id} className="min-w-0 flex-1" onClick={() => select(id)} aria-label={`Ouvrir ${byId.get(id)?.title ?? ''}`}>{thumb(id, 72)}</button>)}</div>
              <div className="flex flex-1 flex-col p-2.5">
                <div className="mb-1 text-sm font-medium leading-snug">{idea.titles.map(shortTitle).join(' + ')}</div>
                <div className="mb-2 text-xs text-[var(--fg-muted)]">{idea.reasons.join(' · ')}</div>
                <button className="btn btn-primary mt-auto self-start !py-0.5 !text-xs" onClick={() => startPrep(idea.ids)}>Prévoir à partir de demain</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
