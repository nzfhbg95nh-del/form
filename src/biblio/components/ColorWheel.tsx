import { useEffect, useRef, useState } from 'react'
import { hexToHsv, hsvToHex } from '@/biblio/lib/colors.ts'

const SIZE = 200
const R = SIZE / 2

/** Roue de couleurs (teinte autour, saturation vers le centre) et curseur de luminosité à droite. */
export function ColorWheel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const slider = useRef<HTMLDivElement>(null)
  const [hsv, setHsv] = useState<[number, number, number]>(() => (value ? hexToHsv(value) : [0, 0, 1]))
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // La roue est dessinée une seule fois (à pleine luminosité).
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(SIZE, SIZE)
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - R + 0.5
        const dy = y - R + 0.5
        const dist = Math.hypot(dx, dy)
        if (dist > R) continue
        const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
        const hex = hsvToHex(hue, Math.min(1, dist / R), 1)
        const i = (y * SIZE + x) * 4
        img.data[i] = parseInt(hex.slice(0, 2), 16)
        img.data[i + 1] = parseInt(hex.slice(2, 4), 16)
        img.data[i + 2] = parseInt(hex.slice(4, 6), 16)
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [])

  // La valeur change de l'extérieur (« Aucune », puce retirée) : on se remet d'accord.
  useEffect(() => {
    if (!value) setHsv([0, 0, 1])
  }, [value])

  const commit = (next: [number, number, number]) => {
    setHsv(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(hsvToHex(...next)), 80)
  }

  const pickOnWheel = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - rect.left - R
    const dy = e.clientY - rect.top - R
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
    commit([hue, Math.min(1, Math.hypot(dx, dy) / R), hsv[2]])
  }
  const pickOnSlider = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    commit([hsv[0], hsv[1], 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))])
  }

  const angle = (hsv[0] * Math.PI) / 180
  const top = hsvToHex(hsv[0], hsv[1], 1)
  const current = hsvToHex(...hsv)

  return (
    <div className="flex items-start gap-3 select-none">
      <div className="relative" style={{ width: SIZE, height: SIZE, touchAction: 'none' }}>
        <canvas
          ref={canvas}
          width={SIZE}
          height={SIZE}
          className="rounded-full"
          style={{ cursor: 'crosshair' }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            pickOnWheel(e)
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) pickOnWheel(e)
          }}
        />
        <div
          className="pointer-events-none absolute h-4 w-4 rounded-full border-2 border-white"
          style={{
            left: R + Math.cos(angle) * hsv[1] * R - 8,
            top: R + Math.sin(angle) * hsv[1] * R - 8,
            background: `#${current}`,
            boxShadow: '0 0 0 1px rgba(0,0,0,.5)',
          }}
        />
      </div>
      <div
        ref={slider}
        className="relative rounded-md"
        style={{ width: 20, height: SIZE, background: `linear-gradient(#${top}, #000)`, cursor: 'ns-resize', touchAction: 'none' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pickOnSlider(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) pickOnSlider(e)
        }}
      >
        <div
          className="pointer-events-none absolute -left-0.5 h-2 w-6 rounded-sm border-2 border-white"
          style={{ top: `calc(${(1 - hsv[2]) * 100}% - 4px)`, boxShadow: '0 0 0 1px rgba(0,0,0,.5)' }}
        />
      </div>
    </div>
  )
}
