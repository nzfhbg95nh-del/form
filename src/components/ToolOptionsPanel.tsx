import { SplitSlider } from '@/components/SplitSlider'
import type { VcToolOptions } from '@/lib/vectorEngine'

interface Setting { key: keyof VcToolOptions; label: string; min: number; max: number; step: number; unit: string }

/** Les réglages des outils de dessin qui en ont : taille de la gomme et de la tache, fidélité du crayon, du pinceau et du lisseur. */
export const TOOL_SETTINGS: Record<string, Setting[]> = {
  eraser: [
    { key: 'size', label: 'Taille', min: 1, max: 150, step: 1, unit: ' px' },
    { key: 'angle', label: 'Angle', min: -180, max: 180, step: 5, unit: '°' },
    { key: 'roundness', label: 'Arrondi', min: 1, max: 100, step: 1, unit: ' %' },
  ],
  blobBrush: [{ key: 'size', label: 'Taille', min: 1, max: 150, step: 1, unit: ' px' }],
  pencil: [{ key: 'fidelity', label: 'Fidélité', min: 0.5, max: 20, step: 0.5, unit: ' px' }],
  paintbrush: [{ key: 'fidelity', label: 'Fidélité', min: 0.5, max: 20, step: 0.5, unit: ' px' }],
  smooth: [{ key: 'fidelity', label: 'Fidélité', min: 0.5, max: 20, step: 0.5, unit: ' px' }],
}

/** Le texte d'une valeur de réglage (« 12 px », « 45° »…). */
export const settingText = (v: number, unit: string) => `${Math.round(v * 10) / 10}${unit}`

export function ToolOptionsPanel({ tool, options, onChange }: { tool: string; options: VcToolOptions | null; onChange: (key: string, value: number) => void }) {
  const settings = TOOL_SETTINGS[tool]
  if (!settings || !options) return null
  return (
    <div data-ui className="absolute bottom-16 left-1/2 z-30 flex w-72 -translate-x-1/2 flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 shadow-[var(--shadow-lift)]">
      <div className="lib-count">Réglages</div>
      {settings.map((s) => {
        const v = options[s.key]
        if (typeof v !== 'number') return null
        const clamped = Math.max(s.min, Math.min(s.max, v))
        return (
          <SplitSlider
            key={s.key}
            small
            min={s.min}
            max={s.max}
            step={s.step}
            value={clamped}
            onChange={(nv) => onChange(s.key, nv)}
            label={s.label}
            valueLabel={settingText(v, s.unit)}
            ariaLabel={s.label}
          />
        )
      })}
    </div>
  )
}
