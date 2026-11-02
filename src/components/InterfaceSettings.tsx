import { useState } from 'react'
import { SettingsHeader, SettingsSection } from '@/components/SettingsUi'
import { loadReduceMotion, loadTextSize, setReduceMotion, setTextSize, TEXT_SIZES, type TextSize } from '@/lib/uiPrefs'
import { useApp, type Theme } from '@/store/app'

const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: 'Clair' },
  { id: 'dark', label: 'Sombre' },
]

/** Un choix parmi quelques boutons : le choisi est marqué. */
function Choice<T extends string>({ items, value, onChange, label }: { items: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {items.map((it) => (
        <button
          key={it.id}
          role="radio"
          aria-checked={value === it.id}
          onClick={() => onChange(it.id)}
          className={'btn' + (value === it.id ? ' btn-primary' : '')}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

/** Quelques réglages rapides pour changer un peu l'interface. */
export function InterfaceSettings() {
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const [size, setSize] = useState<TextSize>(loadTextSize)
  const [calm, setCalm] = useState(loadReduceMotion)

  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <SettingsHeader title="Interface" subtitle="Quelques réglages rapides pour adapter Form à ton écran et à tes yeux. Ils s'appliquent tout de suite." />

      <SettingsSection title="Thème" description="Clair ou sombre.">
        <Choice items={THEMES} value={theme} label="Thème" onChange={(id) => { if (id !== theme) toggleTheme() }} />
      </SettingsSection>

      <SettingsSection title="Taille du texte" description="Agrandit ou réduit tout ce qui est écrit dans Form (menus, pages, réglages).">
        <Choice items={TEXT_SIZES} value={size} label="Taille du texte" onChange={(id) => { setSize(id); setTextSize(id) }} />
      </SettingsSection>

      <SettingsSection title="Animations" description="Pour une interface plus posée, ou si les mouvements te fatiguent.">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={calm} onChange={(e) => { setCalm(e.target.checked); setReduceMotion(e.target.checked) }} />
          Réduire les animations
        </label>
      </SettingsSection>
    </div>
  )
}
