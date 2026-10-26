import { Search } from 'lucide-react'

/** Le champ de recherche de Form : une loupe et un champ, le même partout (listes, recettes, collections). `className` règle sa largeur et sa place. */
export function SearchInput({ value, onChange, placeholder, label, className = '' }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string; className?: string }) {
  return (
    <label className={'relative flex items-center ' + className}>
      <Search size={14} className="pointer-events-none absolute left-3 text-[var(--fg-muted)]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="lib-input w-full rounded-full border py-1.5 pl-9 pr-3 text-sm outline-none placeholder:text-[var(--fg-muted)]"
      />
    </label>
  )
}
