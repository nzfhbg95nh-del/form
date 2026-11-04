import type { ReactNode } from 'react'

/** Titre d'une page de réglages. */
export function SettingsHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-[var(--fg-muted)]">{subtitle}</p>}
    </header>
  )
}

/** Un bloc de réglages : un titre, une phrase d'explication, puis le contenu. */
export function SettingsSection({ title, description, icon, children }: { title: string; description?: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5 rounded-xl border border-[var(--border)] p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {icon}
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-[var(--fg-muted)]">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Une barre de choix (un seul choix à la fois), dans le même style que les onglets : le choisi est « posé » en blanc. `block` : elle prend toute la largeur. */
export function SegmentedBar<T extends string>({ items, value, onChange, label, block = false }: { items: { id: T; label: ReactNode; title?: string }[]; value: T; onChange: (id: T) => void; label: string; block?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={(block ? 'flex w-full' : 'inline-flex flex-wrap') + ' gap-1 rounded-xl bg-[var(--bg-side)] p-1'}>
      {items.map((it) => {
        const active = it.id === value
        return (
          <button
            key={it.id}
            role="radio"
            aria-checked={active}
            title={it.title}
            aria-label={it.title}
            onClick={() => onChange(it.id)}
            className={'flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ' + (block ? 'flex-1 ' : '') + (active ? 'bg-[var(--bg)] font-medium shadow-sm' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]')}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

export interface SubNavItem<T extends string> {
  id: T
  label: string
  /** Petite pastille (un nombre, « ! »…) à droite du nom. */
  badge?: string
}

/** Onglets d'une page de réglages : une seule partie est visible à la fois, au lieu d'une page interminable. */
export function SubNav<T extends string>({ items, value, onChange }: { items: SubNavItem<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="mb-6 flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-[var(--bg-side)] p-1">
      {items.map((it) => {
        const active = it.id === value
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className={'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ' + (active ? 'bg-[var(--bg)] font-medium shadow-sm' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]')}
          >
            {it.label}
            {it.badge && <span className="rounded-full bg-[var(--bg-hover)] px-1.5 text-[11px] leading-5 tabular-nums">{it.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
