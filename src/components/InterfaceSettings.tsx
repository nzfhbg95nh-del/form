import { useState } from 'react'
import { SegmentedBar, SettingsHeader, SettingsSection } from '@/components/SettingsUi'
import { loadReduceMotion, loadTextScale, nearestTextSize, setReduceMotion, setTextScale, TEXT_SIZES } from '@/lib/uiPrefs'
import { useApp, type Theme } from '@/store/app'

const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: 'Clair' },
  { id: 'dark', label: 'Sombre' },
]

const SIZE_ITEMS = TEXT_SIZES.map((s) => ({ id: String(s.scale), label: s.label }))

/** Quelques réglages rapides pour changer un peu l'interface. */
export function InterfaceSettings() {
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const [scale, setScale] = useState(() => nearestTextSize(loadTextScale()))
  const [calm, setCalm] = useState(loadReduceMotion)

  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <SettingsHeader title="Interface" subtitle="Quelques réglages rapides pour adapter Form à ton écran et à tes yeux. Ils s'appliquent tout de suite." />

      <SettingsSection title="Thème" description="Clair ou sombre.">
        <SegmentedBar items={THEMES} value={theme} label="Thème" onChange={(id) => { if (id !== theme) toggleTheme() }} />
      </SettingsSection>

      <SettingsSection title="Taille du texte" description="Agrandit ou réduit tout ce qui est écrit dans Form (menus, pages, réglages).">
        <SegmentedBar items={SIZE_ITEMS} value={String(scale)} label="Taille du texte" onChange={(id) => { setScale(Number(id)); setTextScale(Number(id)) }} />
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
