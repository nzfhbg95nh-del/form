import { Camera } from 'lucide-react'
import { FilterChips, SearchField, SearchFilterBar, type FilterChip } from '@/components/SearchFilters'
import { PALETTE } from '@/biblio/lib/colors.ts'
import { ColorBar } from './ColorBar.tsx'
import { DATE_PRESETS, datePreset, type Filters } from '@/biblio/lib/filters.ts'
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

export function FilterBar({ onImageSearch, onCloseCollection }: { onImageSearch?: () => void; onCloseCollection?: () => void }) {
  const { blocks, shown, filters, setFilters, clearFilters, typeIndex, semantic, searching } = useGrid()
  const bySight = semantic ? shown.reduce((n, b) => n + (semantic.has(b.id) ? 1 : 0), 0) : 0
  const applyDate = (from: string, to: string) => setFilters({ dateFrom: from, dateTo: to })
  const typeNames = new Map(typeIndex.types.map((t) => [t.id, t.name]))

  const chips: FilterChip[] = []
  const add = (id: string, label: string, patch: Partial<Filters>) => chips.push({ id, label, remove: () => setFilters(patch) })
  // La croix de la collection ouverte fait un pas en arrière (page Collections, ou le tableau parent), comme le bouton « Collections ».
  if (filters.collection) {
    if (onCloseCollection) chips.push({ id: 'col', label: `Collection ${filters.collection.name}`, remove: onCloseCollection })
    else add('col', `Collection ${filters.collection.name}`, { collection: null })
  }
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
    <SearchFilterBar
      bordered
      chips={
        <FilterChips
          chips={chips}
          onClear={clearFilters}
          summary={<>{nf.format(shown.length)} sur {nf.format(blocks.length)} blocs
            {searching ? ' · recherche dans les images…' : semantic && filters.query.trim() && bySight > 0 ? ` · dont ${nf.format(bySight)} trouvés par ressemblance` : ''}</>}
        />
      }
    >
        <SearchField
          value={filters.query}
          onChange={(query) => setFilters({ query })}
          placeholder="Rechercher : un auteur, ou ce que tu vois (t-shirt, chaise rouge…)"
          label="Rechercher"
          trailing={
            <>
              <Popover compact label="Chercher par couleur" align="right" active={Boolean(filters.color)} width={340}
                icon={<span className="h-3.5 w-3.5 rounded-full" style={{ background: filters.color ? `#${filters.color}` : 'conic-gradient(#ff5a5a, #ffc94a, #5ad16a, #4ab8ff, #9a6bff, #ff5ab4, #ff5a5a)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} />}>
                <div className="p-1">
                  <ColorBar value={filters.color} onChange={(hex) => setFilters({ color: hex })} />
                  {filters.color && (
                    <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
                      <span className="h-4 w-4 rounded-full border" style={{ background: `#${filters.color}`, borderColor: 'var(--border)' }} />
                      #{filters.color.toUpperCase()}
                      <button className="ml-auto underline" onClick={() => setFilters({ color: '' })}>Aucune</button>
                    </div>
                  )}
                </div>
              </Popover>
              {onImageSearch && (
                <button
                  type="button"
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] transition-colors hover:bg-[var(--slider-fill)]"
                  style={{ color: 'var(--fg-muted)' }}
                  onClick={onImageSearch}
                  title="Chercher avec une image : dépose ou choisis une image, la bibliothèque montre celles qui lui ressemblent"
                  aria-label="Rechercher avec une image"
                >
                  <Camera size={15} />
                </button>
              )}
            </>
          }
        />

        <Popover label="Type d'image" active={filters.types.length > 0} count={filters.types.length} width={300}>
          <div className="max-h-80 overflow-auto">
            {typeIndex.types.length === 0 && <p className="px-2 py-1.5 text-sm text-[var(--fg-muted)]">Pas encore de types : ils apparaissent quand la bibliothèque est lue (Réglages › Bibliothèque).</p>}
            {typeIndex.types.map((t) => (
              <CheckRow key={t.id} checked={filters.types.includes(t.id)} onChange={(on) => setFilters({ types: toggle(filters.types, t.id, on) })} count={t.count}>{t.name}</CheckRow>
            ))}
          </div>
        </Popover>

        <Popover label="Format" active={filters.kinds.length + filters.sources.length > 0} count={filters.kinds.length + filters.sources.length} width={220}>
          {KINDS.map((k) => (
            <CheckRow key={k.id} checked={filters.kinds.includes(k.id)} onChange={(on) => setFilters({ kinds: toggle(filters.kinds, k.id, on) })}>{k.label}</CheckRow>
          ))}
          <div className="mx-2 mb-1 mt-2 border-t pt-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--fg-muted)' }}>Source</div>
          {SOURCES.map((s) => (
            <CheckRow key={s.id} checked={filters.sources.includes(s.id)} onChange={(on) => setFilters({ sources: toggle(filters.sources, s.id, on) })}>{s.label}</CheckRow>
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
          <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 px-2 pb-3 text-sm">
            <span style={{ color: 'var(--fg-muted)' }}>Du</span>
            <input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(e) => setFilters({ dateFrom: e.target.value })} className="rounded border px-1.5 py-1" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }} />
            <span style={{ color: 'var(--fg-muted)' }}>Au</span>
            <input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(e) => setFilters({ dateTo: e.target.value })} className="rounded border px-1.5 py-1" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }} />
          </div>
        </Popover>



    </SearchFilterBar>
  )
}
