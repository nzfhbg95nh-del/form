import { useEffect, useRef, useState } from 'react'
import { hexToHsv, hsvToHex } from '@/biblio/lib/colors.ts'

/** Début de la barre de teintes : en dessous, c'est la zone des gris (pas de couleur). */
const GRAY_END = 0.12
const SAT = 0.6

/** Position (0 à 1) → teinte et saturation. */
const fromX = (x: number): [number, number] => (x < GRAY_END ? [0, 0] : [((x - GRAY_END) / (1 - GRAY_END)) * 360, SAT])
/** Teinte et saturation → position (0 à 1). */
const toX = (h: number, s: number) => (s < 0.12 ? GRAY_END / 2 : GRAY_END + (h / 360) * (1 - GRAY_END))

function track(stops: string[]) {
  return `linear-gradient(to right, ${stops.map((c) => `#${c}`).join(', ')})`
}

/** Une barre arrondie à poignée ronde, comme le curseur « COLOR » de la maquette : on glisse n'importe où dessus. */
function Bar({ label, x, background, knob, onX }: { label: string; x: number; background: string; knob: string; onX: (x: number) => void }) {
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onX(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
  }
  return (
    <div className="flex items-center gap-3">
      <span className="lib-count w-14 shrink-0">{label}</span>
      {/* La marge de chaque côté laisse la place de la poignée aux deux extrémités. */}
      <div className="min-w-0 flex-1 px-3">
        <div
          className="relative h-[18px] cursor-ew-resize touch-none rounded-full"
          style={{ background, boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--fg) 10%, transparent)' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e) }}
          onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e) }}
        >
          <span
            className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${x * 100}%`, background: knob, border: '1px solid rgba(255,255,255,.55)', boxShadow: '0 1px 6px rgba(0,0,0,.28)', backdropFilter: 'blur(2px)' }}
          />
        </div>
      </div>
    </div>
  )
}

/** Choix d'une couleur par deux barres : la teinte (avec les gris au début) et la luminosité. */
export function ColorBar({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<[number, number, number]>(() => (value ? hexToHsv(value) : [0, 0, 1]))
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => { if (!value) setHsv([0, 0, 1]) }, [value])
  const commit = (next: [number, number, number]) => {
    setHsv(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(hsvToHex(...next)), 80)
  }
  const [h, s, v] = hsv
  const hueStops = Array.from({ length: 25 }, (_, i) => {
    const [hh, ss] = fromX(i / 24)
    return hsvToHex(hh, ss, v)
  })
  return (
    <div className="flex select-none flex-col gap-4 py-1">
      <Bar
        label="Teinte"
        x={toX(h, s)}
        background={track(hueStops)}
        knob="rgba(150,150,160,.85)"
        onX={(x) => { const [hh, ss] = fromX(x); commit([hh, ss, v]) }}
      />
      <Bar
        label="Clarté"
        x={v}
        background={track([hsvToHex(h, s, 0), hsvToHex(h, s, 1)])}
        knob="rgba(150,150,160,.85)"
        onX={(x) => commit([h, s, x])}
      />
    </div>
  )
}
