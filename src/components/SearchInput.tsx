import { SearchField } from './SearchFilters'

/** Recherche en pilule (la même que la barre « Recherche + filtres »). */
export function SearchInput({ value, onChange, placeholder, label, className = '' }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string; className?: string }) {
  return <SearchField value={value} onChange={onChange} placeholder={placeholder} label={label} className={className} />
}
