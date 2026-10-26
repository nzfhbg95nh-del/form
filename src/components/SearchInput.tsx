import { Search } from 'lucide-react'

/** Le champ de recherche de Form : une loupe et un champ, le même partout (listes, recettes, collections). `className` règle sa largeur et sa place. */
export function SearchInput({ value, onChange, placeholder, label, className = '' }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string; className?: string }) {
  return (
    <label className={'relative flex items-center ' + className}>
      <Search size={14} className="pointer-events-none absolute left-2.5 text-[var(--fg-muted)]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="w-full rounded-md border border-[var(--border)] bg-transparent py-1.5 pl-8 pr-2 text-sm outline-none placeholder:text-[var(--fg-muted)] focus:border-[var(--accent)]"
      />
    </label>
  )
}
