import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Clock, List, Repeat, Search, Sparkles, X } from 'lucide-react'
import { recipePhotoStyle } from '@/components/RecipeCard'
import { factBadges, RecipeFilterBar, useRecipeFacts } from '@/components/RecipeFilters'
import { Icon } from '@/components/Icon'
import { useLibrary } from '@/biblio/store/library.ts'
import { displayTitle } from '@/lib/lastEdit'
import { dishTitle } from '@/lib/vegTitle'
import { CUISINES, filterScore, ingredientWords, NO_FILTERS, type RecipeFilters } from '@/lib/recipeFacets'
import { normalize } from '@/lib/search'
import type { ObjectRow } from '@/lib/types'

export interface PickerSuggestion { id: string; reasons: string[]; warning?: string | null }

const fmt = (m: number | null) => (m === null || m <= 0 ? null : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`)
const BADGE: Record<string, React.CSSProperties> = { green: { background: 'rgba(68,131,97,0.15)', color: '#448361' }, orange: { background: 'rgba(217,115,13,0.15)', color: '#d9730d' }, neutral: {} }

function Photo({ row, h }: { row: ObjectRow | undefined; h: number }) {
  const style = row ? recipePhotoStyle(row) : undefined
  return <div className="flex w-full shrink-0 items-center justify-center bg-[var(--bg-side)]" style={{ height: h, ...style }}>{!style && <Icon value={row?.icon && row.icon !== '🍳' ? row.icon : '🍽️'} size={Math.round(h * 0.35)} />}</div>
}

/**
 * La grande fenêtre pour choisir un plat (repas du planning, meal prep) : d'abord quelques plats proposés et pourquoi,
 * les plats déjà prévus (pour manger les restes), puis « Choisir moi-même » : toutes les recettes en liste lisible,
 * avec recherche et filtres. `picked` : plats déjà ajoutés (la fenêtre reste ouverte si `keepOpen`).
 */
export function DishPicker({ rows, title, subtitle, header, suggestions, again = [], picked = [], keepOpen = false, onPick, onClose }: {
  rows: ObjectRow[]
  title: string
  subtitle?: string
  /** Réglage en haut de la fenêtre (ex. « Je cuisine pour N repas »). */
  header?: React.ReactNode
  suggestions: PickerSuggestion[]
  /** Plats déjà prévus, à remettre (restes). */
  again?: string[]
  picked?: string[]
  keepOpen?: boolean
  onPick: (id: string) => void
  onClose: () => void
}) {
  useLibrary((s) => s.root + s.ready)
  const [mode, setMode] = useState<'suggest' | 'list'>(suggestions.length > 0 ? 'suggest' : 'list')
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<RecipeFilters>(NO_FILTERS)
  const [active, setActive] = useState(0)
  const facts = useRecipeFacts(rows)
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])
  const searchRef = useRef<HTMLInputElement>(null)

  const list = useMemo(() => {
    const nq = normalize(q.trim())
    const scored = rows
      .filter((r) => nq === '' || normalize(`${dishTitle(r)} ${displayTitle(r.title)}`).includes(nq))
      .map((r) => ({ r, score: facts.has(r.id) ? filterScore(facts.get(r.id)!, filters) : 1 }))
      .filter((x) => x.score > 0)
      .sort((a, b) => dishTitle(a.r).localeCompare(dishTitle(b.r), 'fr'))
    if (ingredientWords(filters.have).length > 0) scored.sort((a, b) => b.score - a.score)
    return scored.map((x) => x.r)
  }, [rows, q, filters, facts])
  useEffect(() => setActive(0), [q, filters])
  useEffect(() => { if (mode === 'list') searchRef.current?.focus() }, [mode])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])

  const pick = (id: string) => { onPick(id); if (!keepOpen) onClose() }
  const isPicked = (id: string) => picked.includes(id)
  const badges = (id: string) => factBadges(facts.get(id)).map((b) => <span key={b.label} className="rounded px-1.5 py-px text-[11px] font-medium" style={BADGE[b.tone]}>{b.label}</span>)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[6vh]" onMouseDown={onClose}>
      <div role="dialog" aria-label={title} className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-[var(--fg-muted)]">{subtitle}</p>}
            {header && <div className="mt-2">{header}</div>}
          </div>
          <button className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]" aria-label="Fermer" onClick={onClose}><X size={18} /></button>
        </div>

        {mode === 'suggest' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Sparkles size={14} /> Proposés pour toi</div>
            <div className="mb-5 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
              {suggestions.map((s) => {
                const row = byId.get(s.id)
                return (
                  <button key={s.id} onClick={() => pick(s.id)} disabled={isPicked(s.id)} className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] text-left transition-colors hover:border-[#2383e2] hover:bg-[var(--bg-hover)] disabled:opacity-60">
                    <Photo row={row} h={120} />
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <div className="font-medium leading-snug">{row ? dishTitle(row) : ''}</div>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-[var(--fg-muted)]">
                        {fmt(facts.get(s.id)?.minutes ?? null) && <span className="mr-1 inline-flex items-center gap-0.5"><Clock size={11} /> {fmt(facts.get(s.id)?.minutes ?? null)}</span>}
                        {badges(s.id)}
                      </div>
                      <div className="text-xs text-[var(--fg-muted)]">{s.reasons.join(' · ')}</div>
                      {s.warning && <div className="text-xs" style={{ color: '#d9730d' }}>{s.warning}</div>}
                      {isPicked(s.id) && <div className="flex items-center gap-1 text-xs" style={{ color: '#448361' }}><Check size={12} /> Ajouté</div>}
                    </div>
                  </button>
                )
              })}
            </div>
            {again.length > 0 && (
              <div className="mb-5">
                <div className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Repeat size={14} /> Remanger un plat déjà prévu (restes)</div>
                <div className="flex flex-wrap gap-2">
                  {again.map((id) => byId.get(id) && (
                    <button key={id} onClick={() => pick(id)} className="flex items-center gap-2 rounded-lg border border-[var(--border)] py-1 pl-1 pr-3 text-sm hover:bg-[var(--bg-hover)]">
                      <span className="h-8 w-8 overflow-hidden rounded"><Photo row={byId.get(id)} h={32} /></span>{dishTitle(byId.get(id)!)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button className="btn flex items-center gap-1.5" onClick={() => setMode('list')}><List size={15} /> Choisir moi-même dans toutes mes recettes</button>
          </div>
        ) : (
          <>
            <div className="border-b border-[var(--border)] px-5 pt-3">
              <div className="mb-3 flex items-center gap-2">
                {suggestions.length > 0 && <button className="btn flex items-center gap-1 !px-2 !py-1 !text-sm" onClick={() => setMode('suggest')}><ArrowLeft size={14} /> Suggestions</button>}
                <label className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5" style={{ background: 'color-mix(in srgb, var(--fg) 6%, transparent)' }}>
                  <Search size={15} className="shrink-0 text-[var(--fg-muted)]" />
                  <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une recette…" aria-label="Chercher une recette" className="min-w-0 flex-1 bg-transparent outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(list.length - 1, i + 1)) }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
                      else if (e.key === 'Enter' && list[active]) pick(list[active].id)
                    }} />
                </label>
                <span className="text-sm text-[var(--fg-muted)]">{list.length}</span>
              </div>
              <RecipeFilterBar filters={filters} onChange={setFilters} facts={[...facts.values()]} />
            </div>
            <div role="listbox" aria-label="Recettes" className="min-h-0 flex-1 overflow-y-auto p-2">
              {list.length === 0 && <p className="px-3 py-4 text-sm text-[var(--fg-muted)]">Aucune recette ne correspond.</p>}
              {list.map((r, i) => {
                const f = facts.get(r.id)
                const cuisine = CUISINES.find((c) => c.id === f?.cuisine)
                return (
                  <button key={r.id} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => pick(r.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left" style={{ background: i === active ? 'var(--bg-hover)' : undefined }}>
                    <span className="h-12 w-16 shrink-0 overflow-hidden rounded-md"><Photo row={r} h={48} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{dishTitle(r)}</span>
                      <span className="flex flex-wrap items-center gap-1 text-xs text-[var(--fg-muted)]">
                        {fmt(f?.minutes ?? null) && <span className="mr-1 inline-flex items-center gap-0.5"><Clock size={11} /> {fmt(f?.minutes ?? null)}</span>}
                        {badges(r.id)}
                        {cuisine && <span className="ml-1">{cuisine.emoji} {cuisine.label}</span>}
                      </span>
                    </span>
                    {isPicked(r.id) && <span className="flex items-center gap-1 text-xs" style={{ color: '#448361' }}><Check size={12} /> Ajouté</span>}
                  </button>
                )
              })}
            </div>
          </>
        )}
        {keepOpen && (
          <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-2 text-sm">
            <span className="text-[var(--fg-muted)]">{picked.length} plat{picked.length > 1 ? 's' : ''} choisi{picked.length > 1 ? 's' : ''}</span>
            <button className="btn btn-primary !text-sm" onClick={onClose}>Terminé</button>
          </div>
        )}
      </div>
    </div>
  )
}
