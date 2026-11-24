import { useMemo, useState } from 'react'
import { Check, ChevronDown, Clock, Globe, Sprout, X } from 'lucide-react'
import { parseContent } from '@/lib/content'
import { parseValues } from '@/lib/database'
import { displayTitle } from '@/lib/lastEdit'
import { MEAT, readSteps, stepsMinutes } from '@/lib/mealPrep'
import { CUISINES, cuisineOf, hasFilters, isInSeason, NO_FILTERS, TIME_BUCKETS, type RecipeFacts, type RecipeFilters } from '@/lib/recipeFacets'
import { RECIPE } from '@/lib/recipes'
import { recipeSeason } from '@/lib/seasons'
import { fold, shoppingLines } from '@/lib/shoppingList'
import type { CardBadge } from '@/components/RecipeCard'
import type { ObjectRow } from '@/lib/types'

/** Ce qu'on sait de chaque recette (temps, saison, végé, cuisine), pour les vignettes et les filtres. */
export function useRecipeFacts(rows: ObjectRow[]): Map<string, RecipeFacts> {
  return useMemo(() => {
    const month = new Date().getMonth() + 1
    return new Map(rows.map((row) => {
      const blocks = parseContent(row.content) ?? []
      const read = shoppingLines(blocks)
      const steps = readSteps(blocks).steps
      const v = parseValues(row.properties)
      const prep = Number(v[RECIPE.prep])
      // Le temps noté dans la recette, sinon une estimation d'après les étapes (durées écrites + 3 min par étape).
      const minutes = Number.isFinite(prep) && prep > 0 ? Math.round(prep) : steps.length > 0 ? Math.round((stepsMinutes(steps) + 3 * steps.length) / 5) * 5 || null : null
      const season = recipeSeason(read.lines, month)
      const title = displayTitle(row.title)
      return [row.id, {
        minutes,
        inSeason: season.inSeason,
        outOfSeason: season.outOfSeason,
        veg: read.variant !== null || !MEAT.test(fold(read.lines.join(' '))),
        cuisine: cuisineOf(title, read.lines, v[RECIPE.cuisine]),
        lines: read.lines,
      }]
    }))
  }, [rows])
}

/** Les vignettes d'une carte : de saison ou hors saison, végé. */
export function factBadges(f: RecipeFacts | undefined): CardBadge[] {
  if (!f) return []
  const out: CardBadge[] = []
  if (isInSeason(f)) out.push({ label: 'De saison', tone: 'green' })
  else if (f.outOfSeason.length > 0) out.push({ label: 'Hors saison', tone: 'orange' })
  if (f.veg) out.push({ label: 'Végé', tone: 'green' })
  return out
}

const pill = (on: boolean) => 'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm ' + (on ? 'border-[#2383e2] bg-[#2383e2]/10 text-[var(--fg)]' : 'border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]')

function Menu({ label, icon, items, selected, onToggle, count }: { label: string; icon: React.ReactNode; items: { id: string; label: string; emoji?: string }[]; selected: string[]; onToggle: (id: string) => void; count: (id: string) => number }) {
  const [open, setOpen] = useState(false)
  const chosen = items.filter((i) => selected.includes(i.id)).map((i) => i.label)
  return (
    <div className="relative">
      <button className={pill(chosen.length > 0)} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {icon} {chosen.length > 0 ? chosen.join(', ') : label} <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onMouseDown={() => setOpen(false)} />
          <div role="menu" className="absolute left-0 top-full z-40 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1 shadow-xl">
            {items.map((i) => (
              <button key={i.id} role="menuitemcheckbox" aria-checked={selected.includes(i.id)} onClick={() => onToggle(i.id)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--bg-hover)]">
                <span className={'flex h-4 w-4 items-center justify-center rounded border ' + (selected.includes(i.id) ? 'border-[#2383e2] bg-[#2383e2] text-white' : 'border-[var(--fg-muted)]')}>{selected.includes(i.id) && <Check size={11} strokeWidth={3} />}</span>
                {i.emoji && <span>{i.emoji}</span>}<span className="flex-1">{i.label}</span><span className="text-xs text-[var(--fg-muted)]">{count(i.id)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** La barre de filtres des recettes : de saison, temps, cuisine du monde, « J'ai… ». */
export function RecipeFilterBar({ filters, onChange, facts }: { filters: RecipeFilters; onChange: (f: RecipeFilters) => void; facts: RecipeFacts[] }) {
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button className={pill(filters.season)} aria-pressed={filters.season} onClick={() => onChange({ ...filters, season: !filters.season })}><Sprout size={13} /> De saison <span className="text-xs opacity-70">{facts.filter(isInSeason).length}</span></button>
      <Menu label="Temps" icon={<Clock size={13} />} items={TIME_BUCKETS} selected={filters.time ? [filters.time] : []}
        onToggle={(id) => onChange({ ...filters, time: filters.time === id ? null : (id as RecipeFilters['time']) })}
        count={(id) => facts.filter((f) => f.minutes !== null && (id === 'rapide' ? f.minutes <= 30 : id === 'moyen' ? f.minutes > 30 && f.minutes <= 60 : f.minutes > 60)).length} />
      <Menu label="Cuisine du monde" icon={<Globe size={13} />} items={CUISINES} selected={filters.cuisines} onToggle={(id) => onChange({ ...filters, cuisines: toggle(filters.cuisines, id) })} count={(id) => facts.filter((f) => f.cuisine === id).length} />
      <label className="flex min-w-[16rem] flex-1 items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-0.5 text-sm focus-within:border-[#2383e2]">
        <span className="shrink-0 text-[var(--fg-muted)]">J’ai…</span>
        <input value={filters.have} onChange={(e) => onChange({ ...filters, have: e.target.value })} placeholder="des courgettes, des pois chiches" aria-label="Ingrédients que j’ai" className="min-w-0 flex-1 bg-transparent outline-none" />
      </label>
      {hasFilters(filters) && <button className="flex items-center gap-1 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]" onClick={() => onChange(NO_FILTERS)}><X size={13} /> Effacer</button>}
    </div>
  )
}
