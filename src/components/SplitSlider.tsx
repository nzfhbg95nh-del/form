import { useRef } from 'react'

/**
 * Un curseur à deux zones (comme la barre Coffee / Milk de la maquette) : la zone teintée à gauche grandit, la zone grise à droite rétrécit,
 * et une poignée blanche les sépare. On glisse n'importe où sur la barre ; les flèches du clavier règlent aussi (Maj = par 10).
 * Même hauteur et mêmes bouts arrondis (pilule) que les boutons de l'appli.
 */
export function SplitSlider({ value, min, max, step = 1, onChange, label, right = '', valueLabel, small = false, ariaLabel, className = '' }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void
  label: string; right?: string; ariaLabel: string; className?: string
  /** Ce qui s'affiche après le libellé (par défaut, la position en %). */
  valueLabel?: string
  /** Version compacte (barre de fenêtre, réglages) : même forme, libellés un peu plus serrés. */
  small?: boolean
}) {
  const track = useRef<HTMLDivElement>(null)
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const set = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const raw = min + ((clientX - r.left) / r.width) * (max - min)
    const snapped = Math.round(raw / step) * step
    onChange(Math.max(min, Math.min(max, snapped)))
  }
  const mono = 'font-mono text-[11px] uppercase tracking-wider'
  const padX = small ? 14 : 16
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className={'group relative ' + 'h-[34px]' + ' cursor-ew-resize touch-none select-none ' + className}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e.clientX) }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e.clientX) }}
      onKeyDown={(e) => {
        const d = e.shiftKey ? step * 10 : step
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { onChange(Math.max(min, value - d)); e.preventDefault() }
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { onChange(Math.min(max, value + d)); e.preventDefault() }
      }}
    >
      <div className="grid h-full items-end gap-1.5" style={{ gridTemplateColumns: `minmax(0, ${pct}fr) 4px minmax(0, ${100 - pct}fr)` }}>
        <div className="min-w-0" style={{ height: '100%', borderRadius: 999, background: 'color-mix(in srgb, var(--accent) 18%, transparent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)' }} />
        <div className="rounded-full bg-[var(--fg)]" style={{ width: 4, height: '100%', boxShadow: '0 0 0 2px var(--bg)' }} />
        <div className="min-w-0" style={{ height: '100%', borderRadius: 999, background: 'color-mix(in srgb, var(--fg) 8%, transparent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--fg) 10%, transparent)' }} />
      </div>
      {/* Les libellés flottent par-dessus, au milieu de la barre. */}
      <div
        className={mono + ' pointer-events-none absolute inset-x-0 flex justify-between whitespace-nowrap'}
        style={{ top: '50%', transform: 'translateY(-50%)', paddingInline: padX }}
      >
        <span style={{ color: 'color-mix(in srgb, var(--accent) 70%, var(--fg))' }}>{label} <b className="font-semibold text-[var(--accent)]">{valueLabel ?? `${Math.round(pct)}%`}</b></span>
        <span className="text-[var(--fg-muted)]">{right}</span>
      </div>
    </div>
  )
}
