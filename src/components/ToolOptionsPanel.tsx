import { useState } from 'react'
import { SplitSlider } from '@/components/SplitSlider'
import type { VcToolOptions } from '@/lib/vectorEngine'

interface Setting { key: keyof VcToolOptions; label: string; min: number; max: number; step: number; unit: string }

/** Les réglages des outils de dessin qui en ont : taille de la gomme et de la tache, fidélité du crayon, du pinceau et du lisseur. */
export const TOOL_SETTINGS: Record<string, Setting[]> = {
  eraser: [
    { key: 'size', label: 'Taille', min: 1, max: 150, step: 1, unit: ' px' },
    { key: 'roundness', label: 'Arrondi', min: 1, max: 100, step: 1, unit: ' %' },
    { key: 'angle', label: 'Angle', min: -180, max: 180, step: 5, unit: '°' },
  ],
  blobBrush: [{ key: 'size', label: 'Taille', min: 1, max: 150, step: 1, unit: ' px' }],
  pencil: [{ key: 'fidelity', label: 'Fidélité', min: 0.5, max: 20, step: 0.5, unit: ' px' }],
  paintbrush: [{ key: 'fidelity', label: 'Fidélité', min: 0.5, max: 20, step: 0.5, unit: ' px' }],
  smooth: [{ key: 'fidelity', label: 'Fidélité', min: 0.5, max: 20, step: 0.5, unit: ' px' }],
}

/** Le texte d'une valeur de réglage (« 12 px », « 45° »…). */
export const settingText = (v: number, unit: string) => `${Math.round(v * 10) / 10}${unit}`

/** Les réglages de départ du moteur, au cas où il n'a pas encore répondu (le panneau s'affiche tout de suite). */
const DEFAULTS: Record<string, VcToolOptions> = {
  eraser: { size: 10, angle: 0, roundness: 100 },
  blobBrush: { size: 10 },
  pencil: { fidelity: 1.5 },
  paintbrush: { fidelity: 1.5 },
  smooth: { fidelity: 2.5 },
}

export function ToolOptionsPanel({ tool, options, onChange }: { tool: string; options: VcToolOptions | null; onChange: (key: string, value: number) => void }) {
  // La valeur affichée suit la main tout de suite (le moteur répond un peu après) : la poignée ne saute plus pendant qu'on la tire.
  const [local, setLocal] = useState<{ tool: string; values: VcToolOptions }>({ tool, values: {} })
  const mine = local.tool === tool ? local.values : {}
  const current: VcToolOptions = { ...DEFAULTS[tool], ...options, ...mine }
  // L'angle ne change rien tant que le bout de la gomme est un rond parfait (arrondi à 100 %) : on ne le propose que pour un bout aplati.
  const settings = TOOL_SETTINGS[tool]?.filter((s) => s.key !== 'angle' || (current.roundness ?? 100) < 100)
  if (!settings) return null
  return (
    <div
      data-ui
      className="absolute bottom-16 left-1/2 z-30 flex w-72 -translate-x-1/2 flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 shadow-[var(--shadow-lift)]"
      // Ce qui se passe sur ce panneau ne doit pas partir vers la toile (déplacements de souris, flèches du clavier).
      onPointerMove={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="lib-count">Réglages</div>
      {settings.map((s) => {
        const v = current[s.key]
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
            onChange={(nv) => { setLocal((l) => ({ tool, values: { ...(l.tool === tool ? l.values : {}), [s.key]: nv } })); onChange(s.key, nv) }}
            label={s.label}
            valueLabel={settingText(v, s.unit)}
            ariaLabel={s.label}
          />
        )
      })}
    </div>
  )
}
