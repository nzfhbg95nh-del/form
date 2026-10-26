import { useRef } from 'react'

/**
 * Un curseur à deux zones (comme la barre Coffee / Milk de la maquette) : la zone teintée à gauche grandit, la zone grise à droite rétrécit,
 * et une poignée blanche les sépare. On glisse n'importe où sur la barre ; les flèches du clavier règlent aussi (Maj = par 10).
 */
export function SplitSlider({ value, min, max, step = 1, onChange, label, right, ariaLabel, className = '' }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void
  label: string; right: string; ariaLabel: string; className?: string
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
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className={'group relative grid h-9 cursor-ew-resize touch-none select-none items-stretch gap-1.5 ' + className}
      style={{ gridTemplateColumns: `minmax(0, ${pct}fr) 4px minmax(0, ${100 - pct}fr)` }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e.clientX) }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e.clientX) }}
      onKeyDown={(e) => {
        const d = e.shiftKey ? step * 10 : step
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { onChange(Math.max(min, value - d)); e.preventDefault() }
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { onChange(Math.min(max, value + d)); e.preventDefault() }
      }}
    >
      <div className="flex min-w-0 items-center overflow-hidden rounded-lg px-2.5" style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
        <span className={mono + ' truncate whitespace-nowrap'} style={{ color: 'color-mix(in srgb, var(--accent) 70%, var(--fg))' }}>{label} <b className="font-semibold text-[var(--accent)]">{Math.round(pct)}%</b></span>
      </div>
      <div className="self-center rounded-full bg-[var(--fg)] transition-transform duration-150 group-hover:scale-x-125 group-active:scale-x-125" style={{ width: 4, height: '100%', boxShadow: '0 0 0 2px var(--bg)' }} />
      <div className="flex min-w-0 items-center justify-end overflow-hidden rounded-lg px-2.5" style={{ background: 'color-mix(in srgb, var(--fg) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--fg) 10%, transparent)' }}>
        <span className={mono + ' truncate whitespace-nowrap text-[var(--fg-muted)]'}>{right}</span>
      </div>
    </div>
  )
}
