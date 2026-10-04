import { useState } from 'react'
import { imageName, imageNameWithoutVs16 } from '@/lib/emoji'

const BASE = `${import.meta.env.BASE_URL}emoji/apple/`

/**
 * Icône d'une page : un emoji (affiché en style Apple, quelle que soit la machine) ou une image
 * (icône chargée ou créée avec Gemini, enregistrée sous forme de « data URL »).
 */
export function Icon({ value, size = 16, className }: { value: string | null | undefined; size?: number; className?: string }) {
  // 0 = image avec FE0F, 1 = sans FE0F, 2 = texte (si aucune image n'existe).
  const [stage, setStage] = useState(0)
  if (!value) return null
  const box = { width: size, height: size, fontSize: size * 0.9, lineHeight: 1 }
  if (value.startsWith('data:')) {
    return <img src={value} alt="" draggable={false} className={className} style={{ ...box, borderRadius: size * 0.18, objectFit: 'cover', display: 'inline-block', flexShrink: 0 }} />
  }
  if (stage >= 2) return <span className={className} style={{ ...box, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{value}</span>
  const name = stage === 0 ? imageName(value) : imageNameWithoutVs16(value)
  return (
    <img
      src={`${BASE}${name}.png`}
      alt={value}
      draggable={false}
      loading="lazy"
      className={className}
      style={{ ...box, display: 'inline-block', flexShrink: 0 }}
      onError={() => setStage(stage + 1)}
    />
  )
}
