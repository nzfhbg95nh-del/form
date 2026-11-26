// La barre « Recherche + filtres » de Form, la même sur tous les écrans (Bibliothèque, Recettes, Factures, bases de données…) :
//   [ 🔍 Rechercher…              ]  [Filtre ⌄] [Filtre ⌄] [Bascule]
//   12 sur 119 · (filtre ×) (filtre ×) · Tout effacer
// Les pièces s'assemblent librement : chaque écran garde ses propres filtres et son propre état.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

/** La barre entière : la ligne recherche + filtres, puis (s'il y en a) la ligne des filtres choisis. */
export function SearchFilterBar({ children, chips, className = '', bordered = false }: { children: ReactNode; chips?: ReactNode; className?: string; bordered?: boolean }) {
  return (
    <div className={(bordered ? 'border-b border-[var(--border)] px-4 py-2.5 ' : '') + className}>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {chips}
    </div>
  )
}

/** La grande recherche en pilule, avec sa loupe ; `trailing` : un petit bouton posé au bout (ex. chercher avec une image). */
export function SearchField({ value, onChange, placeholder, label, trailing, className = 'w-96 max-w-full', autoFocus, onKeyDown, inputRef }: {
  value: string; onChange: (v: string) => void; placeholder: string; label?: string; trailing?: ReactNode; className?: string
  autoFocus?: boolean; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void; inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <label className={'form-search relative flex items-center ' + className}>
      <Search size={14} className="pointer-events-none absolute left-3 z-[1] text-[var(--fg-muted)]" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoFocus={autoFocus}
        className={'box-border h-8 w-full rounded-[10px] border-0 py-0 pl-9 text-sm outline-none placeholder:text-[var(--fg-muted)] ' + (trailing ? 'pr-16' : value ? 'pr-8' : 'pr-3')}
        style={{ color: 'var(--fg)' }}
      />
      {trailing ? (
        <span className="absolute right-1.5 flex items-center gap-0.5">{trailing}</span>
      ) : value ? (
        <button type="button" className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--slider-fill)] hover:text-[var(--fg)]" onClick={() => onChange('')} aria-label="Effacer la recherche" title="Effacer">
          <X size={13} />
        </button>
      ) : null}
    </label>
  )
}

/** Un filtre en pilule qui ouvre un petit panneau ; teinté quand il est actif (`count` : combien de choix). Se ferme d'un clic à côté ou avec Échap. */
export function FilterPill({ label, icon, active, count, children, width = 260, align = 'left', compact = false }: {
  label: string; icon?: ReactNode; active?: boolean; count?: number; children: ReactNode; width?: number; align?: 'left' | 'right'
  /** Juste l'icône, petite (ex. dans la recherche) ; `label` sert d'infobulle. */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  // Le panneau est posé sous le bouton mais reste toujours dans la fenêtre.
  const place = () => {
    const r = button.current?.getBoundingClientRect()
    if (!r) return
    const w = Math.min(width, window.innerWidth - 16)
    const wanted = align === 'right' ? r.right - w : r.left
    setPos({ left: Math.max(8, Math.min(wanted, window.innerWidth - w - 8)), top: r.bottom + 4, maxHeight: Math.max(160, window.innerHeight - r.bottom - 16) })
  }
  useEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      {compact ? (
        <button ref={button} type="button" className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] hover:bg-[var(--slider-fill)]" style={active ? { background: 'var(--slider-fill)', boxShadow: 'var(--slider-shadow)' } : undefined} onClick={() => setOpen((o) => !o)} aria-pressed={active ? true : undefined} aria-expanded={open} aria-haspopup="dialog" aria-label={label} title={label}>
          {icon}
        </button>
      ) : (
      <button ref={button} className="btn" onClick={() => setOpen((o) => !o)} aria-pressed={active ? true : undefined} aria-expanded={open} aria-haspopup="dialog">
        {icon}
        {label}
        {active && count !== undefined && count > 0 && <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10.5px] font-semibold leading-4 text-white tabular-nums">{count}</span>}
        <ChevronDown size={14} className="chev transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      )}
      {open && pos && (
        <div
          data-popup
          className="form-pop fixed z-30 overflow-auto rounded-xl border p-2"
          style={{ left: pos.left, top: pos.top, width: Math.min(width, window.innerWidth - 16), maxHeight: pos.maxHeight, background: 'var(--bg)', borderColor: 'var(--border)' }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** Un filtre tout simple, allumé ou éteint d'un clic (ex. « De saison »). */
export function ToggleFilter({ label, icon, pressed, count, onClick }: { label: string; icon?: ReactNode; pressed: boolean; count?: number; onClick: () => void }) {
  return (
    <button className="btn" aria-pressed={pressed} onClick={onClick}>
      {icon}
      {label}
      {count !== undefined && <span className="text-[11px] tabular-nums opacity-60">{count}</span>}
    </button>
  )
}

/** Une case à cocher dans le panneau d'un filtre, avec son nombre à droite. */
export function CheckRow({ checked, onChange, children, count }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; count?: number }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-[var(--bg-hover)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--accent)]" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-[var(--fg-muted)]">{count}</span>}
    </label>
  )
}

export interface FilterChip { id: string; label: string; remove: () => void }

/** La ligne des filtres choisis : « 12 sur 119 », un bouton par filtre (× pour le retirer), « Tout effacer ». Rien quand aucun filtre n'est choisi. */
export function FilterChips({ summary, chips, onClear }: { summary?: ReactNode; chips: FilterChip[]; onClear: () => void }) {
  if (chips.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {summary && <span className="mr-1 text-sm text-[var(--fg-muted)]">{summary}</span>}
      {chips.map((c) => (
        <button key={c.id} onClick={c.remove} className="flex items-center gap-1 rounded-full bg-[var(--bg-hover)] px-2.5 py-0.5 text-xs hover:bg-[color-mix(in_srgb,var(--fg)_12%,var(--bg))]" title="Retirer ce filtre">
          {c.label} <X size={11} />
        </button>
      ))}
      <button className="ml-1 text-xs text-[var(--fg-muted)] underline hover:text-[var(--fg)]" onClick={onClear}>Tout effacer</button>
    </div>
  )
}
