import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface RailItem<T extends string> {
  id: T
  label: ReactNode
  /** Infobulle (et nom pour les lecteurs d'écran quand `label` n'est qu'une icône). */
  title?: string
  /** Petite pastille (un nombre, « ! »…) à droite du nom. */
  badge?: string
}

/**
 * Des onglets façon curseur : une piste gris clair, l'onglet choisi est une pastille blanche en relief qui glisse d'un onglet à l'autre.
 * `kind` : « tab » (onglets qui changent de page) ou « radio » (un choix parmi plusieurs). `block` : prend toute la largeur.
 * `after` : un élément posé au bout de la piste (ex. « + » pour ajouter une vue).
 */
export function TabRail<T extends string>({ items, value, onChange, label, kind = 'tab', block = false, small = false, after, className = '' }: {
  items: RailItem<T>[]
  value: T
  onChange: (id: T) => void
  label: string
  kind?: 'tab' | 'radio'
  block?: boolean
  small?: boolean
  after?: ReactNode
  className?: string
}) {
  const rail = useRef<HTMLDivElement>(null)
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const [knob, setKnob] = useState<{ left: number; width: number; top: number; height: number } | null>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current.get(value)
      if (!el) return setKnob(null)
      setKnob({ left: el.offsetLeft, width: el.offsetWidth, top: el.offsetTop, height: el.offsetHeight })
    }
    measure()
    const watcher = new ResizeObserver(measure)
    if (rail.current) watcher.observe(rail.current)
    // Pas d'animation au premier affichage : la pastille est déjà à sa place.
    const t = requestAnimationFrame(() => setReady(true))
    return () => { watcher.disconnect(); cancelAnimationFrame(t) }
  }, [value, items.length])

  return (
    <div
      ref={rail}
      role={kind === 'tab' ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={'relative max-w-full flex-wrap items-center gap-0.5 rounded-[12px] p-[3px] ' + (block ? 'flex w-full ' : 'inline-flex ') + className}
      style={{ background: 'var(--slider-track)' }}
    >
      {knob && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-[9px]"
          style={{ left: knob.left, top: knob.top, width: knob.width, height: knob.height, background: 'var(--slider-fill)', boxShadow: 'var(--slider-shadow)', transition: ready ? 'left 0.3s var(--ease-spring), width 0.3s var(--ease-spring), top 0.2s' : 'none' }}
        />
      )}
      {items.map((it) => {
        const active = it.id === value
        return (
          <button
            key={it.id}
            ref={(el) => { if (el) refs.current.set(it.id, el); else refs.current.delete(it.id) }}
            role={kind}
            aria-selected={kind === 'tab' ? active : undefined}
            aria-checked={kind === 'radio' ? active : undefined}
            title={it.title}
            aria-label={it.title}
            onClick={() => onChange(it.id)}
            className={'relative z-[1] flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] transition-colors duration-150 ' + (small ? 'h-[26px] px-2.5 text-[12.5px] ' : 'h-[28px] px-3 text-[13px] ') + (block ? 'flex-1 ' : '') + (active ? 'font-medium text-[var(--fg)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]')}
          >
            {it.label}
            {it.badge && <span className="rounded-full bg-[var(--bg-hover)] px-1.5 text-[11px] leading-5 tabular-nums">{it.badge}</span>}
          </button>
        )
      })}
      {after}
    </div>
  )
}
