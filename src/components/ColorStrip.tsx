import { useState } from 'react'

export interface StripColor {
  /** « #rrggbb » ou « rrggbb ». */
  hex: string
  /** Part de l'image en % (absent : toutes les couleurs ont la même part). */
  pct?: number
}

const withHash = (hex: string) => (hex.startsWith('#') ? hex : `#${hex}`).toUpperCase()

/**
 * La barre de couleurs d'une création : une bande fine, chaque couleur à sa proportion, séparées par un petit espace, bouts arrondis.
 * Chaque couleur garde une largeur minimum (`min`, 24 px) pour rester facile à cliquer, même à 2 %.
 * Au survol, la couleur s'épaissit et son code apparaît au-dessus ; un clic la donne à `onPick` (ex. copier le code).
 */
export function ColorStrip({ colors, onPick, height = 12, min = 24, className = '' }: { colors: StripColor[]; onPick?: (hex: string) => void; height?: number; min?: number; className?: string }) {
  const [hover, setHover] = useState<string | null>(null)
  if (colors.length === 0) return null
  return (
    <div className={'flex items-center gap-[3px] ' + className} style={{ height: height + 10 }} onMouseLeave={() => setHover(null)}>
      {colors.map((c, i) => {
        const code = withHash(c.hex)
        const on = hover === code
        const first = i === 0
        const last = i === colors.length - 1
        return (
          <button
            key={`${code}-${i}`}
            type="button"
            className="relative h-full shrink-0 outline-none focus-visible:z-10"
            style={{ flex: `${Math.max(c.pct ?? 1, 0.01)} 1 0`, minWidth: min }}
            onMouseEnter={() => setHover(code)}
            onFocus={() => setHover(code)}
            onBlur={() => setHover(null)}
            onClick={() => onPick?.(code)}
            title={c.pct !== undefined ? `${code} (${c.pct} %) : cliquer pour copier` : `${code} : cliquer pour copier`}
            aria-label={`Copier ${code}`}
          >
            <span
              className="absolute inset-x-0 top-1/2 block"
              style={{
                height,
                background: code,
                transform: `translateY(-50%) scaleY(${on ? 1.7 : 1})`,
                borderRadius: `${first ? 999 : 3}px ${last ? 999 : 3}px ${last ? 999 : 3}px ${first ? 999 : 3}px`,
                boxShadow: on ? '0 2px 8px -2px rgba(0,0,0,.35), inset 0 0 0 1px rgba(0,0,0,.12)' : 'inset 0 0 0 1px rgba(0,0,0,.12)',
                transition: 'transform 0.18s var(--ease-spring), box-shadow 0.18s',
              }}
            />
            {on && (
              <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums" style={{ background: 'var(--fg)', color: 'var(--bg)' }}>
                {code}{c.pct !== undefined ? ` · ${c.pct} %` : ''}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
