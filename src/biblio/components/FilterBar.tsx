import { Search, X } from 'lucide-react'
import { PALETTE } from '@/biblio/lib/colors.ts'
import { ColorBar } from './ColorBar.tsx'
import { activeCount, DATE_PRESETS, datePreset, type Filters } from '@/biblio/lib/filters.ts'
import type { BlockKind, Source } from '@/biblio/lib/scan.ts'
import { formatDate } from '@/biblio/lib/media.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { CheckRow, Popover } from './Popover.tsx'

const SOURCES: { id: Source; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'pinterest', label: 'Pinterest' },
]
const KINDS: { id: BlockKind; label: string }[] = [
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Vidéo' },
  { id: 'carousel', label: 'Carrousel' },
]
const nf = new Intl.NumberFormat('fr-FR')

const toggle = <T,>(list: T[], value: T, on: boolean) => (on ? [...list, value] : list.filter((v) => v !== value))

export function FilterBar() {
  const { blocks, shown, filters, setFilters, clearFilters, typeIndex, semantic, searching } = useGrid()
  const bySight = semantic ? shown.reduce((n, b) => n + (semantic.has(b.id) ? 1 : 0), 0) : 0
  const count = activeCount(filters)
  const applyDate = (from: string, to: string) => setFilters({ dateFrom: from, dateTo: to })
  const typeNames = new Map(typeIndex.types.map((t) => [t.id, t.name]))

  const chips: { id: string; label: string; remove: () => void }[] = []
  const add = (id: string, label: string, patch: Partial<Filters>) => chips.push({ id, label, remove: () => setFilters(patch) })
  if (filters.collection) add('col', `Collection ${filters.collection.name}`, { collection: null })
  if (filters.query.trim()) add('q', `« ${filters.query.trim()} »`, { query: '' })
  for (const s of filters.sources) add(`s-${s}`, SOURCES.find((x) => x.id === s)?.label ?? s, { sources: filters.sources.filter((v) => v !== s) })
  for (const k of filters.kinds) add(`k-${k}`, KINDS.find((x) => x.id === k)?.label ?? k, { kinds: filters.kinds.filter((v) => v !== k) })
  for (const t of filters.types) add(`y-${t}`, typeNames.get(t) ?? t, { types: filters.types.filter((v) => v !== t) })
  if (filters.color) add('c', `Couleur ${PALETTE.find((p) => p.hex === filters.color)?.label ?? `#${filters.color.toUpperCase()}`}`, { color: '' })
  if (filters.dateFrom || filters.dateTo) {
    const from = formatDate(filters.dateFrom || null)
    const to = formatDate(filters.dateTo || null)
    add('d', from && to ? `${from} → ${to}` : from ? `depuis le ${from}` : `jusqu'au ${to}`, { dateFrom: '', dateTo: '' })
  }
  if (filters.shuffle !== 0) add('r', 'Aléatoire', { shuffle: 0 })

  return (
    <div className="border-b px-4 py-2.5" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-96 max-w-full">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} />
          <input
            value={filters.query}
            onChange={(e) => setFilters({ query: e.target.value })}
            placeholder="Rechercher : un auteur, ou ce que tu vois (t-shirt, chaise rouge…)"
            className="lib-input w-full rounded-full border py-1.5 pl-9 pr-3 text-sm outline-none"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
            aria-label="Rechercher"
          />
        </div>

        <Popover label="Type d'image" active={filters.types.length > 0} width={300}>
          <div className="max-h-80 overflow-auto">
            {typeIndex.types.map((t) => (
              <CheckRow key={t.id} checked={filters.types.includes(t.id)} onChange={(on) => setFilters({ types: toggle(filters.types, t.id, on) })} count={t.count}>{t.name}</CheckRow>
            ))}
          </div>
        </Popover>

        <Popover label="Couleur" active={Boolean(filters.color)} width={340}>
          <div className="p-1">
            <ColorBar value={filters.color} onChange={(hex) => setFilters({ color: hex })} />
            <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
              {filters.color ? (
                <>
                  <span className="h-4 w-4 rounded-full border" style={{ background: `#${filters.color}`, borderColor: 'var(--border)' }} />
                  #{filters.color.toUpperCase()}
                  <button className="ml-auto underline" onClick={() => setFilters({ color: '' })}>Aucune</button>
                </>
              ) : (
                'Glisse sur les barres pour choisir une couleur'
              )}
            </div>
          </div>
        </Popover>

        <Popover label="Source" active={filters.sources.length > 0} width={200}>
          {SOURCES.map((s) => (
            <CheckRow key={s.id} checked={filters.sources.includes(s.id)} onChange={(on) => setFilters({ sources: toggle(filters.sources, s.id, on) })}>{s.label}</CheckRow>
          ))}
        </Popover>

        <Popover label="Format" active={filters.kinds.length > 0} width={200}>
          {KINDS.map((k) => (
            <CheckRow key={k.id} checked={filters.kinds.includes(k.id)} onChange={(on) => setFilters({ kinds: toggle(filters.kinds, k.id, on) })}>{k.label}</CheckRow>
          ))}
        </Popover>

        <Popover label="Date" active={Boolean(filters.dateFrom || filters.dateTo)} width={260}>
          <div className="flex flex-col gap-1">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                className="rounded px-2 py-1 text-left text-sm hover:bg-[var(--bg-hover)]"
                onClick={() => {
                  const { from, to } = datePreset(p.id, new Date())
                  applyDate(from, to)
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 px-2 text-sm">
            <span style={{ color: 'var(--fg-muted)' }}>Du</span>
            <input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(e) => setFilters({ dateFrom: e.target.value })} className="rounded border px-1.5 py-1" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }} />
            <span style={{ color: 'var(--fg-muted)' }}>Au</span>
            <input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(e) => setFilters({ dateTo: e.target.value })} className="rounded border px-1.5 py-1" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }} />
          </div>
          <p className="mt-2 px-2 text-xs" style={{ color: 'var(--fg-muted)' }}>Les blocs Pinterest n'ont pas de date de publication : ils sont masqués avec ce filtre.</p>
        </Popover>



      </div>

      {count > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm" style={{ color: 'var(--fg-muted)' }}>{nf.format(shown.length)} sur {nf.format(blocks.length)} blocs
            {searching ? ' · recherche dans les images…' : semantic && filters.query.trim() && bySight > 0 ? ` · dont ${nf.format(bySight)} trouvés par ressemblance` : ''}</span>
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={c.remove}
              className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs"
              style={{ background: 'var(--bg-hover)' }}
              title="Retirer ce filtre"
            >
              {c.label} <X size={11} />
            </button>
          ))}
          <button className="ml-1 text-xs underline" style={{ color: 'var(--fg-muted)' }} onClick={clearFilters}>Tout effacer</button>
        </div>
      )}
    </div>
  )
}
