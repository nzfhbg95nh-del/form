import { countBy, docYears, hasDocFilters, NO_CLIENT, NO_DOC_FILTERS, type DocFacts, type DocFilters } from '@/lib/docFilters'
import { CheckRow, FilterChips, FilterPill, SearchField, SearchFilterBar, type FilterChip } from '@/components/SearchFilters'

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

/**
 * La barre « Recherche + filtres » des factures et des devis : recherche, Statut, Type (factures), Année, Client,
 * puis la ligne des filtres choisis. `docs` : tous les documents (pour les nombres), `shown` : combien restent.
 */
export function DocFilterBar({ filters, onChange, docs, shown, noun, statusLabels, kindLabels, clientNames }: {
  filters: DocFilters
  onChange: (f: DocFilters) => void
  docs: DocFacts[]
  shown: number
  /** « factures », « devis ». */
  noun: string
  statusLabels: Record<string, string>
  kindLabels?: Record<string, string>
  clientNames: Map<string, string>
}) {
  const set = (patch: Partial<DocFilters>) => onChange({ ...filters, ...patch })
  const byStatus = countBy(docs, (d) => d.status)
  const byKind = countBy(docs, (d) => d.kind)
  const byClient = countBy(docs, (d) => d.clientId ?? NO_CLIENT)
  const years = docYears(docs)
  const clients = [...byClient.keys()].map((id) => ({ id, label: id === NO_CLIENT ? 'Sans client' : (clientNames.get(id) ?? 'Client supprimé') })).sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  const clientLabel = (id: string) => clients.find((c) => c.id === id)?.label ?? id

  const chips: FilterChip[] = []
  if (filters.query.trim()) chips.push({ id: 'q', label: `« ${filters.query.trim()} »`, remove: () => set({ query: '' }) })
  for (const s of filters.statuses) chips.push({ id: `s-${s}`, label: statusLabels[s] ?? s, remove: () => set({ statuses: filters.statuses.filter((x) => x !== s) }) })
  for (const k of filters.kinds) chips.push({ id: `k-${k}`, label: kindLabels?.[k] ?? k, remove: () => set({ kinds: filters.kinds.filter((x) => x !== k) }) })
  for (const y of filters.years) chips.push({ id: `y-${y}`, label: y, remove: () => set({ years: filters.years.filter((x) => x !== y) }) })
  for (const c of filters.clients) chips.push({ id: `c-${c}`, label: clientLabel(c), remove: () => set({ clients: filters.clients.filter((x) => x !== c) }) })

  return (
    <SearchFilterBar
      className="mb-3"
      chips={hasDocFilters(filters) ? <FilterChips chips={chips} summary={`${shown} sur ${docs.length} ${noun}`} onClear={() => onChange(NO_DOC_FILTERS)} /> : null}
    >
      <SearchField className="w-72 max-w-full" placeholder="Rechercher : numéro, objet, client…" label={`Rechercher dans les ${noun}`} value={filters.query} onChange={(query) => set({ query })} />
      <FilterPill label="Statut" active={filters.statuses.length > 0} count={filters.statuses.length} width={240}>
        {Object.entries(statusLabels).map(([id, label]) => (
          <CheckRow key={id} checked={filters.statuses.includes(id)} onChange={() => set({ statuses: toggle(filters.statuses, id) })} count={byStatus.get(id) ?? 0}>{label}</CheckRow>
        ))}
      </FilterPill>
      {kindLabels && (
        <FilterPill label="Type" active={filters.kinds.length > 0} count={filters.kinds.length} width={240}>
          {Object.entries(kindLabels).map(([id, label]) => (
            <CheckRow key={id} checked={filters.kinds.includes(id)} onChange={() => set({ kinds: toggle(filters.kinds, id) })} count={byKind.get(id) ?? 0}>{label}</CheckRow>
          ))}
        </FilterPill>
      )}
      {years.length > 0 && (
        <FilterPill label="Année" active={filters.years.length > 0} count={filters.years.length} width={200}>
          {years.map((y) => (
            <CheckRow key={y.id} checked={filters.years.includes(y.id)} onChange={() => set({ years: toggle(filters.years, y.id) })} count={y.count}>{y.id}</CheckRow>
          ))}
        </FilterPill>
      )}
      {clients.length > 0 && (
        <FilterPill label="Client" active={filters.clients.length > 0} count={filters.clients.length} width={280}>
          {clients.map((c) => (
            <CheckRow key={c.id} checked={filters.clients.includes(c.id)} onChange={() => set({ clients: toggle(filters.clients, c.id) })} count={byClient.get(c.id) ?? 0}>{c.label}</CheckRow>
          ))}
        </FilterPill>
      )}
    </SearchFilterBar>
  )
}
