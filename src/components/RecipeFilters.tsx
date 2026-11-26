import { useMemo } from 'react'
import { Clock, Globe, Sprout } from 'lucide-react'
import { CheckRow, FilterChips, FilterPill, SearchField, SearchFilterBar, ToggleFilter, type FilterChip } from '@/components/SearchFilters'
import { parseContent } from '@/lib/content'
import { parseValues } from '@/lib/database'
import { displayTitle } from '@/lib/lastEdit'
import { MEAT, readSteps, stepsMinutes } from '@/lib/mealPrep'
import { CUISINES, cuisineOf, isInSeason, NO_FILTERS, TIME_BUCKETS, type RecipeFacts, type RecipeFilters } from '@/lib/recipeFacets'
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

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
const inBucket = (id: string, m: number) => (id === 'rapide' ? m <= 30 : id === 'moyen' ? m > 30 && m <= 60 : m > 60)

/** Les filtres des recettes, en pilules (à poser dans une barre « Recherche + filtres ») : de saison, temps, cuisine du monde, « J'ai… ». */
export function RecipeFilterPills({ filters, onChange, facts }: { filters: RecipeFilters; onChange: (f: RecipeFilters) => void; facts: RecipeFacts[] }) {
  return (
    <>
      <ToggleFilter label="De saison" icon={<Sprout size={14} />} pressed={filters.season} count={facts.filter(isInSeason).length} onClick={() => onChange({ ...filters, season: !filters.season })} />
      <FilterPill label={filters.time ? (TIME_BUCKETS.find((b) => b.id === filters.time)?.label ?? 'Temps') : 'Temps'} icon={<Clock size={14} />} active={filters.time !== null} width={240}>
        {TIME_BUCKETS.map((b) => (
          <CheckRow key={b.id} checked={filters.time === b.id} onChange={() => onChange({ ...filters, time: filters.time === b.id ? null : (b.id as RecipeFilters['time']) })}
            count={facts.filter((f) => f.minutes !== null && inBucket(b.id, f.minutes)).length}>{b.label}</CheckRow>
        ))}
      </FilterPill>
      <FilterPill label="Cuisine du monde" icon={<Globe size={14} />} active={filters.cuisines.length > 0} count={filters.cuisines.length} width={260}>
        {CUISINES.map((c) => (
          <CheckRow key={c.id} checked={filters.cuisines.includes(c.id)} onChange={() => onChange({ ...filters, cuisines: toggle(filters.cuisines, c.id) })} count={facts.filter((f) => f.cuisine === c.id).length}>
            {c.emoji ? `${c.emoji} ` : ''}{c.label}
          </CheckRow>
        ))}
      </FilterPill>
    </>
  )
}

/** Les filtres de recettes choisis, pour la ligne sous la barre (un clic en retire un). */
export function recipeFilterChips(filters: RecipeFilters, onChange: (f: RecipeFilters) => void): FilterChip[] {
  const chips: FilterChip[] = []
  if (filters.season) chips.push({ id: 'season', label: 'De saison', remove: () => onChange({ ...filters, season: false }) })
  if (filters.time) chips.push({ id: 'time', label: TIME_BUCKETS.find((b) => b.id === filters.time)?.label ?? 'Temps', remove: () => onChange({ ...filters, time: null }) })
  for (const id of filters.cuisines) chips.push({ id: `c-${id}`, label: CUISINES.find((c) => c.id === id)?.label ?? id, remove: () => onChange({ ...filters, cuisines: filters.cuisines.filter((x) => x !== id) }) })
  if (filters.have.trim()) chips.push({ id: 'have', label: `J’ai : ${filters.have.trim()}`, remove: () => onChange({ ...filters, have: '' }) })
  return chips
}

/** Une barre complète (recherche + filtres de recettes + filtres choisis), pour la fenêtre de choix des plats. */
export function RecipeFilterBar({ filters, onChange, facts, search, summary, before }: {
  filters: RecipeFilters; onChange: (f: RecipeFilters) => void; facts: RecipeFacts[]
  search?: { value: string; onChange: (v: string) => void; placeholder: string; inputRef?: React.Ref<HTMLInputElement>; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void }
  summary?: React.ReactNode
  /** Un bouton posé avant la recherche (ex. retour aux suggestions). */
  before?: React.ReactNode
}) {
  const chips = recipeFilterChips(filters, onChange)
  if (search?.value.trim()) chips.unshift({ id: 'q', label: `« ${search.value.trim()} »`, remove: () => search.onChange('') })
  return (
    <SearchFilterBar chips={<FilterChips chips={chips} summary={summary} onClear={() => { onChange(NO_FILTERS); search?.onChange('') }} />}>
      {before}
      {search && <SearchField value={search.value} onChange={search.onChange} placeholder={search.placeholder} inputRef={search.inputRef} onKeyDown={search.onKeyDown} className="w-72 max-w-full flex-1" />}
      <RecipeFilterPills filters={filters} onChange={onChange} facts={facts} />
    </SearchFilterBar>
  )
}
