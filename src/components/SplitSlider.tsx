import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Le curseur de Form : une piste gris clair et, dedans, une pastille blanche en relief qui grandit avec la valeur.
 * La valeur est écrite dans la pastille (ou juste après elle quand elle est trop courte), une fine poignée en marque le bout.
 * On glisse n'importe où sur la piste ; les flèches du clavier règlent aussi (Maj = par 10). La pastille suit en douceur.
 *
 * Deux dispositions :
 * - en ligne (barres d'outils) : « Taille 220 px » dans la pastille ;
 * - `stacked` (panneaux, réglages) : le libellé au-dessus, la valeur dans la pastille, le minimum et le maximum en petit dessous (`format`).
 */
export function SplitSlider({ value, min, max, step = 1, onChange, label, valueLabel, small = false, stacked = false, format, ariaLabel, className = '' }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void
  label: string; ariaLabel: string; className?: string
  /** Le texte de la valeur (par défaut, la position en %). */
  valueLabel?: string
  /** Version compacte (barre de fenêtre, panneaux). */
  small?: boolean
  /** Libellé au-dessus, minimum et maximum dessous. */
  stacked?: boolean
  /** Texte du minimum et du maximum (disposition `stacked`). */
  format?: (v: number) => string
  /** Anciennes options, sans effet (gardées pour ne rien casser). */
  right?: string
  morph?: boolean
}) {
  const track = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const [dragging, setDragging] = useState(false)
  const [size, setSize] = useState({ track: 0, text: 0, label: 0 })
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const shown = valueLabel ?? `${Math.round(pct)} %`

  useLayoutEffect(() => {
    const measure = () => {
      const next = { track: track.current?.clientWidth ?? 0, text: text.current?.offsetWidth ?? 0, label: labelRef.current?.offsetWidth ?? 0 }
      setSize((s) => (s.track === next.track && s.text === next.text && s.label === next.label ? s : next))
    }
    measure()
    const watcher = new ResizeObserver(measure)
    if (track.current) watcher.observe(track.current)
    return () => watcher.disconnect()
  }, [label, shown, stacked])

  const set = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const raw = min + ((clientX - r.left) / r.width) * (max - min)
    const snapped = Math.round(raw / step) * step
    onChange(Math.max(min, Math.min(max, snapped)))
  }

  const h = small ? 28 : 32
  const pad = 3 // la pastille est posée dans la piste, avec un petit liseré tout autour
  const minFill = 22 // assez pour la poignée, même au minimum
  const inner = Math.max(0, size.track - pad * 2)
  const fill = Math.max(minFill, inner * (pct / 100))
  // Le texte va dans la pastille s'il y tient (avec la poignée à droite), sinon juste après elle.
  // Sur une piste trop courte pour le libellé et la valeur, seule la valeur reste.
  const fits = (w: number) => w + 10 + 16 <= fill || pad + fill + 8 + w + 8 <= size.track
  const withLabel = stacked || size.track === 0 || fits(size.text + size.label)
  const textW = size.text + (withLabel && !stacked ? size.label : 0)
  const inside = textW + 10 + 16 <= fill
  const textLeft = inside ? pad + 10 : pad + fill + 8
  const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
  const move = dragging ? 'width 0.08s linear, left 0.08s linear' : `width 0.25s ${ease}, left 0.25s ${ease}`

  const slider = (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={shown}
      className={'form-slider group relative cursor-ew-resize touch-none select-none rounded-[10px] ' + (stacked ? 'w-full' : className)}
      style={{ height: h, background: 'var(--slider-track)' }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); set(e.clientX) }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e.clientX) }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        const d = e.shiftKey ? step * 10 : step
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { onChange(Math.max(min, value - d)); e.preventDefault() }
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { onChange(Math.min(max, value + d)); e.preventDefault() }
      }}
    >
      <div
        className="absolute rounded-[8px]"
        style={{ left: pad, top: pad, bottom: pad, width: fill, background: 'var(--slider-fill)', boxShadow: 'var(--slider-shadow)', transition: move }}
      >
        <span
          className="absolute top-1/2 rounded-full"
          style={{ right: 7, width: 3, height: small ? 12 : 14, background: 'var(--slider-handle)', transform: `translateY(-50%) scaleY(${dragging ? 1.2 : 1})`, transition: `transform 0.2s ${ease}` }}
        />
      </div>
      <span
        className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap tabular-nums"
        style={{ left: textLeft, fontSize: small ? 11.5 : 12.5, transition: move }}
      >
        {!stacked && <span ref={labelRef} className="inline-block pr-1 text-[var(--fg-muted)]" style={withLabel ? undefined : { position: 'absolute', visibility: 'hidden' }}>{label}</span>}
        <span ref={text} className="font-medium text-[var(--fg)]">{shown}</span>
      </span>
    </div>
  )

  if (!stacked) return slider
  return (
    <div className={className}>
      <div className="mb-1.5 text-[13px] text-[var(--fg)]">{label}</div>
      {slider}
      {format && (
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-[var(--fg-muted)]">
          <span>{format(min)}</span>
          <span>{format(max)}</span>
        </div>
      )}
    </div>
  )
}
