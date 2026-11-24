import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, Lightbulb, ListPlus } from 'lucide-react'
import { getFoodIndex, NUTRITION_MATCHES_SETTING, parseMatches } from '@/components/RecipeNutritionPanel'
import { parseContent } from '@/lib/content'
import { parseValues } from '@/lib/database'
import { dayKey, dayStrip, FOOD_JOURNAL_SETTING, journalDay, parseJournal, type JournalRecipe } from '@/lib/foodJournal'
import { dishTitle } from '@/lib/vegTitle'
import { DAY_NAMES, weekKey, type MealPlan } from '@/lib/mealPlan'
import { recipeNutrition, REFERENCES, type FoodIndex, type Reference, type Totals } from '@/lib/nutrition'
import { weekAdvice, weekReport, MAIN_MEALS_SHARE, type Advice, type PlannedMeal } from '@/lib/nutritionAdvice'
import { RECIPE } from '@/lib/recipes'
import { shoppingLines } from '@/lib/shoppingList'
import type { ObjectRow } from '@/lib/types'
import { useApp } from '@/store/app'

const fmt = (v: number, unit: string) => `${String(v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100).replace('.', ',')} ${unit}`
const SHORT_DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function Gauge({ nutrient: r, value, target }: { nutrient: Reference; value: number | null; target: number }) {
  const pct = value === null ? null : Math.round((value / target) * 100)
  const color = pct === null ? 'transparent' : r.max ? (pct > 100 ? '#d44c47' : '#d9730d') : pct >= 90 ? '#448361' : pct >= 60 ? '#2383e2' : '#d9730d'
  return (
    <div className={'py-1 ' + (r.label.startsWith('dont') ? 'pl-3' : '')}>
      <div className="flex items-baseline gap-2 text-sm">
        <span className={r.label.startsWith('dont') ? 'text-[var(--fg-muted)]' : 'font-medium'}>{r.label}</span>
        {pct !== null && <span className="text-xs text-[var(--fg-muted)]">{pct} %</span>}
        <span className="ml-auto text-xs tabular-nums text-[var(--fg-muted)]">{value === null ? '—' : fmt(value, r.unit)} / {fmt(target, r.unit)}{r.max ? ' max' : ''}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]">
        {pct !== null && <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />}
      </div>
    </div>
  )
}

const LEVEL: Record<Advice['level'], { icon: React.ReactNode; color: string }> = {
  manque: { icon: <AlertTriangle size={16} />, color: '#d44c47' },
  attention: { icon: <Lightbulb size={16} />, color: '#d9730d' },
  bon: { icon: <CheckCircle2 size={16} />, color: '#448361' },
  info: { icon: <Info size={16} />, color: '#2383e2' },
}

/**
 * Nutrition de la semaine : le bilan des repas du planning (une personne, midi + soir) avec des conseils pour une alimentation sans viande,
 * et le suivi quotidien (ce qu'on a vraiment mangé, écrit librement). Repères adultes ANSES / EFSA : pas un avis médical.
 */
export function NutritionView({ plan, week, byId, rows }: { plan: MealPlan; week: string; byId: Map<string, ObjectRow>; rows: ObjectRow[] }) {
  const repo = useApp((s) => s.repo)
  const select = useApp((s) => s.select)
  const [part, setPart] = useState<'bilan' | 'suivi'>('bilan')
  const [index, setIndex] = useState<FoodIndex | null>(null)
  const [manual, setManual] = useState<Record<string, number | null>>({})
  const [journal, setJournal] = useState<Record<string, string>>({})
  const [journalLoaded, setJournalLoaded] = useState(false)
  const [day, setDay] = useState(() => new Date())

  useEffect(() => { void getFoodIndex().then(setIndex) }, [])
  useEffect(() => {
    void (repo?.getSetting(NUTRITION_MATCHES_SETTING) ?? Promise.resolve(null)).then((raw) => setManual(parseMatches(raw)))
    void (repo?.getSetting(FOOD_JOURNAL_SETTING) ?? Promise.resolve(null)).then((raw) => { setJournal(parseJournal(raw)); setJournalLoaded(true) })
  }, [repo])
  const saved = useRef<string | null>(null)
  useEffect(() => {
    if (!journalLoaded || !repo) return
    const text = JSON.stringify(journal)
    if (saved.current === null) { saved.current = text; return }
    if (text === saved.current) return
    const t = window.setTimeout(() => { saved.current = text; void repo.setSetting(FOOD_JOURNAL_SETTING, text) }, 500)
    return () => window.clearTimeout(t)
  }, [journal, journalLoaded, repo])

  // Les nutriments d'une portion de chaque recette (version sans viande quand elle existe).
  const facts = useMemo((): JournalRecipe[] => {
    if (!index) return []
    return rows.map((row) => {
      const read = shoppingLines(parseContent(row.content) ?? [])
      const servings = read.servings ?? (Number(parseValues(row.properties)[RECIPE.servings]) || 4)
      const perServing: Totals = read.lines.length > 0 ? recipeNutrition(read.lines, servings, index, manual).perServing : {}
      // Une recette comptée dans sa version sans viande le dit dans son titre (« Butter chicken… (version sans viande) »).
      return { id: row.id, title: dishTitle(row), perServing, lines: read.lines }
    })
  }, [index, rows, manual])
  const factById = useMemo(() => new Map(facts.map((f) => [f.id, f])), [facts])

  const meals = useMemo((): PlannedMeal[] => (plan.weeks[week] ?? [])
    .filter((e) => byId.has(e.recipeId))
    .map((e) => ({ day: e.day, meal: e.meal, recipeId: e.recipeId, title: dishTitle(byId.get(e.recipeId)!), perServing: factById.get(e.recipeId)?.perServing ?? {}, lines: factById.get(e.recipeId)?.lines })), [plan, week, byId, factById])
  const report = useMemo(() => weekReport(meals), [meals])
  const advice = useMemo(() => weekAdvice(report, meals, facts.filter((f) => Object.keys(f.perServing).length > 0), new Date().getMonth() + 1), [report, meals, facts])

  const key = dayKey(day)
  const text = journal[key] ?? ''
  const today = journalDay(text, index ?? ({ match: () => ({ food: null, how: 'none' }) } as unknown as FoodIndex), facts, manual)
  const plannedThatDay = useMemo(() => {
    const wk = weekKey(day)
    const idx = (day.getDay() + 6) % 7
    return (plan.weeks[wk] ?? []).filter((e) => e.day === idx && byId.has(e.recipeId)).map((e) => dishTitle(byId.get(e.recipeId)!).replace(/\s*\(.*\)\s*$/, ''))
  }, [plan, day, byId])
  const addPlanned = () => {
    const lines = plannedThatDay.map((t) => `1 portion de ${t}`)
    setJournal((j) => ({ ...j, [key]: [text.trim(), ...lines].filter(Boolean).join('\n') }))
  }
  const kcalRef = REFERENCES[0]
  const dayPct = today.totals.kcal !== undefined ? Math.round((today.totals.kcal / kcalRef.daily) * 100) : 0

  const tabs = (
    <div role="tablist" className="mb-4 flex w-fit rounded-lg p-0.5" style={{ background: 'color-mix(in srgb, var(--fg) 6%, transparent)' }}>
      {([['bilan', 'Bilan de la semaine'], ['suivi', 'Suivi quotidien']] as const).map(([id, l]) => (
        <button key={id} role="tab" aria-selected={part === id} onClick={() => setPart(id)} className={'rounded-md px-3 py-1 text-sm ' + (part === id ? 'bg-[var(--bg)] font-medium shadow-sm' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]')}>{l}</button>
      ))}
    </div>
  )

  if (!index) return <div className="max-w-4xl">{tabs}<p className="text-sm text-[var(--fg-muted)]">Chargement de la table Ciqual…</p></div>

  if (part === 'suivi') {
    return (
      <div className="max-w-4xl">
        {tabs}
        <div className="mb-4 flex gap-1 overflow-x-auto pb-1" role="listbox" aria-label="Jour">
          {dayStrip(new Date(), 13, 6).map((d) => {
            const k = dayKey(d)
            const sel = k === key
            const isToday = k === dayKey(new Date())
            return (
              <button key={k} role="option" aria-selected={sel} onClick={() => setDay(d)}
                className={'flex w-12 shrink-0 flex-col items-center rounded-full py-2 text-sm ' + (sel ? 'bg-[rgba(68,131,97,0.2)] font-semibold text-[#448361]' : 'hover:bg-[var(--bg-hover)]')}>
                <span className={isToday && !sel ? 'font-semibold' : ''}>{d.getDate()}</span>
                <span className="text-xs text-[var(--fg-muted)]">{SHORT_DAYS[d.getDay()]}</span>
                {journal[k] && <span className="mt-0.5 h-1 w-1 rounded-full bg-[#448361]" aria-hidden />}
              </button>
            )
          })}
        </div>
        <div className="rounded-xl border border-[var(--border)] p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="mr-auto font-semibold">{dayKey(new Date()) === key ? 'Aujourd’hui' : `${DAY_NAMES[(day.getDay() + 6) % 7]} ${day.getDate()}/${day.getMonth() + 1}`}</h3>
            {plannedThatDay.length > 0 && <button className="btn !text-sm" onClick={addPlanned}><ListPlus size={14} /> Ajouter les repas prévus ({plannedThatDay.length})</button>}
          </div>
          <textarea
            value={text}
            onChange={(e) => setJournal((j) => ({ ...j, [key]: e.target.value }))}
            placeholder={'Une ligne par aliment, par exemple :\n1 café\n1 c. à café de miel\n1 portion de Chana masala\n1 kiwi'}
            aria-label="Ce que j’ai mangé"
            rows={7}
            className="w-full resize-y rounded-lg border border-[var(--border)] bg-transparent p-3 text-sm outline-none focus:border-[#2383e2]"
          />
          {today.lines.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-[var(--fg-muted)]">
              {today.lines.map((l, i) => (
                <li key={i}>
                  <span className="text-[var(--fg)]">{l.line}</span>{' '}
                  {l.kind === 'recipe' && <>→ recette « {l.label} »{l.portions !== 1 ? ` × ${String(l.portions).replace('.', ',')}` : ''}</>}
                  {l.kind === 'food' && <>→ {l.label} (≈ {Math.round(l.grams!)} g)</>}
                  {l.kind === 'noqty' && <span style={{ color: '#d9730d' }}>→ quantité ? (ex. « 2 c. à soupe de … »)</span>}
                  {l.kind === 'unknown' && <span style={{ color: '#d44c47' }}>→ non reconnu</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-lg font-semibold">{dayPct} %</span>
              <span className="text-sm text-[var(--fg-muted)]">de ta journée</span>
              <span className="ml-auto text-xs text-[var(--fg-muted)]">{fmt(today.totals.kcal ?? 0, 'kcal')} / {fmt(kcalRef.daily, 'kcal')} par jour</span>
            </div>
            <div className="grid gap-x-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {REFERENCES.slice(1).map((r) => <Gauge key={r.key} nutrient={r} value={today.totals[r.key] ?? (text.trim() ? 0 : null)} target={r.daily} />)}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[var(--fg-muted)]">Source : Anses, table Ciqual 2020. Repères pour un adulte. Valeurs indicatives, pas un avis médical.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      {tabs}
      {report.meals === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--fg-muted)]">Ajoute des repas dans le planning : le bilan et les conseils de la semaine apparaîtront ici.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-[var(--fg-muted)]">
            Une journée type d’après tes {report.meals} repas prévus (une portion par repas, midi + soir), comparée à la part du midi et du soir dans une journée (environ {Math.round(MAIN_MEALS_SHARE * 100)} % des repères).
          </p>
          <div className="mb-6 grid gap-x-6 rounded-xl border border-[var(--border)] p-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {report.status.map((s) => <Gauge key={s.ref.key} nutrient={s.ref} value={s.average} target={s.target} />)}
          </div>
          <h3 className="mb-2 text-base font-semibold">Conseils de la semaine</h3>
          <div className="space-y-3">
            {advice.map((a) => (
              <div key={a.id} className="rounded-xl border border-[var(--border)] p-3" style={{ borderLeft: `3px solid ${LEVEL[a.level].color}` }}>
                <div className="mb-1 flex items-center gap-2 font-medium" style={{ color: LEVEL[a.level].color }}>{LEVEL[a.level].icon}<span className="text-[var(--fg)]">{a.title}</span></div>
                <p className="text-sm text-[var(--fg-muted)]">{a.text}</p>
                {a.foods && a.foods.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">{a.foods.map((f) => <span key={f} className="rounded-full bg-[var(--bg-side)] px-2 py-0.5 text-xs">{f}</span>)}</div>
                )}
                {a.recipes && a.recipes.length > 0 && (
                  <div className="mt-2 text-xs text-[var(--fg-muted)]">
                    Dans tes recettes :{' '}
                    {a.recipes.map((r, i) => <span key={r.id}>{i > 0 && ', '}<button className="text-[var(--fg)] hover:underline" onClick={() => select(r.id)}>{r.title}</button> ({r.amount})</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-[var(--fg-muted)]">Source : Anses, table Ciqual 2020 ; repères ANSES et EFSA pour un adulte. Conseils généraux pour une alimentation végétarienne, pas un avis médical.</p>
        </>
      )}
    </div>
  )
}
