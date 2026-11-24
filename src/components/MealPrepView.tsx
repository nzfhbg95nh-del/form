import { useMemo, useState } from 'react'
import { Check, ChefHat, Clock, Flame, Snowflake, Sparkles, Refrigerator, Sun, Archive } from 'lucide-react'
import { parseContent } from '@/lib/content'
import { parseValues } from '@/lib/database'
import { displayTitle } from '@/lib/lastEdit'
import { buildSession, fmtMinutes, readSteps, suggestIdeas, type CandidateRecipe, type PrepRecipe, type StorageLine } from '@/lib/mealPrep'
import { DAY_NAMES, type MealPlan } from '@/lib/mealPlan'
import { RECIPE } from '@/lib/recipes'
import { shoppingLines } from '@/lib/shoppingList'
import type { ObjectRow } from '@/lib/types'
import { useApp } from '@/store/app'

const WHERE: Record<StorageLine['meals'][number]['where'], { icon: React.ReactNode; label: string; color: string }> = {
  frigo: { icon: <Refrigerator size={13} />, label: 'Frigo', color: '#2383e2' },
  congélateur: { icon: <Snowflake size={13} />, label: 'Congélateur', color: '#6940a5' },
  'jour même': { icon: <Sun size={13} />, label: 'À faire le jour même', color: '#d9730d' },
  boîte: { icon: <Archive size={13} />, label: 'Boîte hermétique', color: '#448361' },
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 flex items-center gap-2 text-base font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-side)] text-xs">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * Le meal prep de la semaine : une seule séance de cuisine pour tous les repas prévus (mise en place commune, cuissons en lot, ordre),
 * puis où ranger chaque plat (frigo, congélateur, jour même) et comment le réchauffer. Et des idées de meal prep avec les recettes de Victor.
 */
export function MealPrepView({ plan, week, byId, rows, onUseIdea }: {
  plan: MealPlan
  week: string
  byId: Map<string, ObjectRow>
  rows: ObjectRow[]
  onUseIdea: (recipeIds: string[], people: number) => void
}) {
  const select = useApp((s) => s.select)
  const [prepDay, setPrepDay] = useState(-1)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [people, setPeople] = useState(1)
  const [open, setOpen] = useState<Set<string>>(new Set())

  // Les recettes de la semaine, une fois chacune (avec tous leurs repas et le total des personnes).
  const recipes = useMemo((): PrepRecipe[] => {
    const byRecipe = new Map<string, PrepRecipe>()
    for (const e of plan.weeks[week] ?? []) {
      const row = byId.get(e.recipeId)
      if (!row) continue
      const blocks = parseContent(row.content) ?? []
      const v = parseValues(row.properties)
      let r = byRecipe.get(row.id)
      if (!r) {
        const read = shoppingLines(blocks)
        const steps = readSteps(blocks)
        r = { id: row.id, title: displayTitle(row.title), lines: read.lines, factor: 0, steps: steps.steps, variantSteps: read.variant ? steps.variantSteps : [], prep: num(v[RECIPE.prep]), cook: num(v[RECIPE.cook]), meals: [] }
        ;(r as PrepRecipe & { base?: number }).base = read.servings ?? num(v[RECIPE.servings]) ?? 0
        byRecipe.set(row.id, r)
      }
      const base = (r as PrepRecipe & { base?: number }).base
      r.factor += base ? e.servings / base : 1
      r.meals.push({ day: e.day, meal: e.meal })
    }
    return [...byRecipe.values()]
  }, [plan, week, byId])

  const session = useMemo(() => (recipes.length > 0 ? buildSession(recipes, prepDay) : null), [recipes, prepDay])

  // Les idées : toutes les recettes de la base, lues une fois.
  const ideas = useMemo(() => {
    const candidates: CandidateRecipe[] = rows.map((row) => {
      const blocks = parseContent(row.content) ?? []
      const t = parseValues(row.properties)[RECIPE.type]
      return { id: row.id, title: displayTitle(row.title), lines: shoppingLines(blocks).lines, steps: readSteps(blocks).steps, type: typeof t === 'string' ? t : null }
    })
    return suggestIdeas(candidates, 3, new Date().getMonth() + 1)
  }, [rows])

  const toggle = (key: string) => setDone((d) => { const n = new Set(d); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const task = (key: string, text: string, recipesUsing: string[]) => (
    <li key={key} className="flex items-start gap-2.5 rounded-md px-2 py-1 hover:bg-[var(--bg-hover)]">
      <button type="button" role="checkbox" aria-checked={done.has(key)} aria-label={text} onClick={() => toggle(key)}
        className={'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ' + (done.has(key) ? 'border-[#2383e2] bg-[#2383e2] text-white' : 'border-[var(--fg-muted)]')}>
        {done.has(key) && <Check size={12} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={'text-sm ' + (done.has(key) ? 'text-[var(--fg-muted)] line-through' : '')}>{text}</div>
        {recipesUsing.length > 0 && (
          <div className="text-xs text-[var(--fg-muted)]">
            {recipesUsing.length > 1 && <span className="mr-1 rounded bg-[rgba(35,131,226,0.12)] px-1 text-[#2383e2]">commun à {recipesUsing.length} recettes</span>}
            {recipesUsing.join(', ')}
          </div>
        )}
      </div>
    </li>
  )

  const ideaCards = (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto flex items-center gap-2 text-base font-semibold"><Sparkles size={16} /> Idées de meal prep avec tes recettes</h3>
        <span className="text-sm text-[var(--fg-muted)]">pour</span>
        <span className="flex items-center rounded-md border border-[var(--border)] text-sm">
          <button className="px-2" aria-label="Une personne de moins" onClick={() => setPeople((p) => Math.max(1, p - 1))}>−</button>
          <span className="min-w-[4.5rem] text-center tabular-nums">{people} pers.</span>
          <button className="px-2" aria-label="Une personne de plus" onClick={() => setPeople((p) => Math.min(10, p + 1))}>+</button>
        </span>
      </div>
      {ideas.length === 0 ? (
        <p className="text-sm text-[var(--fg-muted)]">Pas encore assez de recettes avec des ingrédients et des étapes pour proposer un meal prep.</p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {ideas.map((idea) => (
            <div key={idea.ids.join()} className="flex flex-col rounded-xl border border-[var(--border)] p-3">
              <ul className="mb-2 space-y-0.5 text-sm font-medium">
                {idea.ids.map((id, i) => <li key={id}><button className="text-left hover:underline" onClick={() => select(id)}>{idea.titles[i]}</button></li>)}
              </ul>
              {idea.shared.length > 0 && <p className="text-xs text-[var(--fg-muted)]">En commun : {idea.shared.join(', ')}</p>}
              {idea.reasons.length > 0 && <p className="text-xs text-[var(--fg-muted)]">{idea.reasons.join(' · ')}</p>}
              <button className="btn btn-primary mt-auto !mt-3 self-start !text-sm" onClick={() => onUseIdea(idea.ids, people)}>Mettre dans cette semaine</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  if (!session) {
    return (
      <div className="max-w-4xl">
        <p className="mb-6 rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--fg-muted)]">
          Ajoute des recettes dans le planning : Form prépare une seule séance de cuisine pour toute la semaine. Ou pars d’une idée ci-dessous.
        </p>
        {ideaCards}
      </div>
    )
  }

  const prepLabel = prepDay === -1 ? 'dimanche (avant la semaine)' : DAY_NAMES[prepDay].toLowerCase()
  return (
    <div className="max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-[var(--bg-side)] p-3">
        <ChefHat size={20} />
        <div className="mr-auto">
          <div className="font-semibold">Une seule séance de cuisine : {prepLabel}</div>
          <div className="flex items-center gap-1 text-sm text-[var(--fg-muted)]"><Clock size={13} /> environ {fmtMinutes(session.minutes)} pour {recipes.length} recette{recipes.length > 1 ? 's' : ''}</div>
        </div>
        <label className="text-sm text-[var(--fg-muted)]">
          Jour de la séance{' '}
          <select value={prepDay} onChange={(e) => setPrepDay(Number(e.target.value))} className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[var(--fg)]">
            <option value={-1}>Dimanche avant</option>
            {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </label>
      </div>

      {session.first.length > 0 && (
        <Section n={1} title="À lancer en premier">
          <ul>{session.first.map((t, i) => task(`first-${i}`, t.text, t.recipes))}</ul>
        </Section>
      )}
      {session.miseEnPlace.length > 0 && (
        <Section n={session.first.length > 0 ? 2 : 1} title="Mise en place commune (tout couper en une fois)">
          <ul>{session.miseEnPlace.map((t, i) => task(`mep-${i}`, t.text, t.recipes))}</ul>
        </Section>
      )}
      <Section n={(session.first.length > 0 ? 1 : 0) + (session.miseEnPlace.length > 0 ? 1 : 0) + 1} title="Les plats, dans cet ordre">
        <ol className="space-y-2">
          {session.cooking.map((c, i) => (
            <li key={c.id} className="rounded-lg border border-[var(--border)]">
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" role="checkbox" aria-checked={done.has(`cook-${c.id}`)} aria-label={`${c.title} terminé`} onClick={() => toggle(`cook-${c.id}`)}
                  className={'flex h-4 w-4 shrink-0 items-center justify-center rounded border ' + (done.has(`cook-${c.id}`) ? 'border-[#2383e2] bg-[#2383e2] text-white' : 'border-[var(--fg-muted)]')}>
                  {done.has(`cook-${c.id}`) && <Check size={12} strokeWidth={3} />}
                </button>
                <span className="text-sm font-medium">{i + 1}. {c.title}</span>
                <span className="ml-auto flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                  {c.oven !== null && <span className="flex items-center gap-0.5"><Flame size={12} /> four {c.oven} °C</span>}
                  <span>≈ {fmtMinutes(c.minutes)}</span>
                  {(c.steps.length > 0 || c.variantSteps.length > 0) && (
                    <button className="hover:underline" onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })}>{open.has(c.id) ? 'Masquer les étapes' : 'Voir les étapes'}</button>
                  )}
                  <button className="hover:underline" onClick={() => select(c.id)}>Ouvrir</button>
                </span>
              </div>
              {open.has(c.id) && (
                <div className="border-t border-[var(--border)] px-3 py-2 text-sm">
                  <ol className="list-decimal space-y-1 pl-5">{c.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
                  {c.variantSteps.length > 0 && (
                    <>
                      <div className="mt-2 text-xs font-semibold text-[var(--fg-muted)]">Version sans viande : ce qui change</div>
                      <ol className="list-decimal space-y-1 pl-5">{c.variantSteps.map((s, k) => <li key={k}>{s}</li>)}</ol>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <Section n={(session.first.length > 0 ? 1 : 0) + (session.miseEnPlace.length > 0 ? 1 : 0) + 2} title="Ranger et réchauffer">
        <div className="space-y-3">
          {session.storage.map((s) => (
            <div key={s.id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="mb-1.5 text-sm font-medium">{s.recipe}</div>
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {s.meals.map((m, k) => (
                  <span key={k} className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs" style={{ background: `color-mix(in srgb, ${WHERE[m.where].color} 14%, transparent)`, color: WHERE[m.where].color }}>
                    {WHERE[m.where].icon} {m.label} · {WHERE[m.where].label}
                  </span>
                ))}
              </div>
              <div className="text-xs text-[var(--fg-muted)]">
                {s.info.pantry ? 'Se garde environ une semaine.' : `Se garde ${s.info.fridgeDays} jours au frigo${s.info.freezer ? ', et environ 3 mois au congélateur (le sortir la veille au frigo)' : ''}.`}
                {!s.info.pantry && !s.info.sameDay && <> Réchauffage : {s.info.reheat}</>}
              </div>
              {s.info.tips.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-[var(--fg-muted)]">{s.info.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--fg-muted)]">Repères prudents pour un frigo à 4 °C : laisser tiédir moins d’une heure avant de mettre au frais, en boîtes fermées.</p>
      </Section>

      <div className="border-t border-[var(--border)] pt-5">{ideaCards}</div>
    </div>
  )
}
