import { useRef } from 'react'

/**
 * Un curseur à deux zones (comme la barre Coffee / Milk de la maquette) : la zone teintée à gauche grandit, la zone grise à droite rétrécit,
 * et une poignée blanche les sépare. On glisse n'importe où sur la barre ; les flèches du clavier règlent aussi (Maj = par 10).
 * Aux extrémités (presque vide ou presque plein), la barre s'amincit en un trait fin et les libellés remontent au-dessus, comme dans la maquette.
 */
export function SplitSlider({ value, min, max, step = 1, onChange, label, right = '', valueLabel, small = false, ariaLabel, className = '' }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void
  label: string; right?: string; ariaLabel: string; className?: string
  /** Ce qui s'affiche après le libellé (par défaut, la position en %). */
  valueLabel?: string
  /** Version compacte (barre de fenêtre, réglages) : pas d'amincissement. */
  small?: boolean
}) {
  const track = useRef<HTMLDivElement>(null)
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const thin = !small && (pct < 30 || pct > 82)
  const set = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const raw = min + ((clientX - r.left) / r.width) * (max - min)
    const snapped = Math.round(raw / step) * step
    onChange(Math.max(min, Math.min(max, snapped)))
  }
  const spring = 'height 0.34s cubic-bezier(0.34, 1.3, 0.64, 1), border-radius 0.3s'
  const mono = small ? 'font-mono text-[10px] uppercase tracking-wider' : 'font-mono text-[11px] uppercase tracking-wider'
  const padX = small ? 8 : 10
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className={'group relative ' + (small ? 'h-6' : 'h-9') + ' cursor-ew-resize touch-none select-none ' + className}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e.clientX) }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e.clientX) }}
      onKeyDown={(e) => {
        const d = e.shiftKey ? step * 10 : step
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { onChange(Math.max(min, value - d)); e.preventDefault() }
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { onChange(Math.min(max, value + d)); e.preventDefault() }
      }}
    >
      <div className="grid h-full items-end gap-1.5" style={{ gridTemplateColumns: `minmax(0, ${pct}fr) 4px minmax(0, ${100 - pct}fr)` }}>
        <div className="min-w-0" style={{ height: thin ? 8 : '100%', transition: spring, borderRadius: thin ? 999 : 8, background: 'color-mix(in srgb, var(--accent) 18%, transparent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)' }} />
        <div className="rounded-full bg-[var(--fg)]" style={{ width: 4, height: thin ? 20 : '100%', transition: spring, boxShadow: '0 0 0 2px var(--bg)' }} />
        <div className="min-w-0" style={{ height: thin ? 8 : '100%', transition: spring, borderRadius: thin ? 999 : 8, background: 'color-mix(in srgb, var(--fg) 8%, transparent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--fg) 10%, transparent)' }} />
      </div>
      {/* Les libellés flottent par-dessus : au milieu de la barre, ou au-dessus d'elle quand elle s'amincit. */}
      <div
        className={mono + ' pointer-events-none absolute inset-x-0 flex justify-between whitespace-nowrap'}
        style={{ top: thin ? 1 : '50%', transform: thin ? 'none' : 'translateY(-50%)', paddingInline: thin ? 2 : padX, transition: 'top 0.34s cubic-bezier(0.34, 1.3, 0.64, 1), transform 0.34s, padding 0.3s' }}
      >
        <span style={{ color: 'color-mix(in srgb, var(--accent) 70%, var(--fg))' }}>{label} <b className="font-semibold text-[var(--accent)]">{valueLabel ?? `${Math.round(pct)}%`}</b></span>
        <span className="text-[var(--fg-muted)]">{right}</span>
      </div>
    </div>
  )
}
