import { useState } from 'react'
import { SegmentedBar, SettingsHeader, SettingsSection } from '@/components/SettingsUi'
import {
  ACCENTS, BOARD_BACKGROUNDS, loadAccent, loadBoardPrefs, loadMotion, loadTextScale, MOTIONS, nearestTextSize, saveBoardPrefs, setAccent, setMotion, setTextScale, TEXT_SIZES,
  type BoardOpen, type BoardPattern, type SnapStrength,
} from '@/lib/uiPrefs'
import { useApp, type ThemeMode } from '@/store/app'

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Clair' },
  { id: 'dark', label: 'Sombre' },
  { id: 'auto', label: 'Auto' },
]

const SIZE_ITEMS = TEXT_SIZES.map((s) => ({ id: String(s.scale), label: s.label }))

const PATTERNS: { id: BoardPattern; label: string }[] = [
  { id: 'dots', label: 'Petits points' },
  { id: 'grid', label: 'Quadrillage' },
  { id: 'none', label: 'Uni' },
]
const SNAP: { id: 'on' | 'off'; label: string }[] = [
  { id: 'on', label: 'Activée' },
  { id: 'off', label: 'Désactivée' },
]
const STRENGTHS: { id: SnapStrength; label: string }[] = [
  { id: 'soft', label: 'Douce' },
  { id: 'normal', label: 'Normale' },
  { id: 'strong', label: 'Forte' },
]
const OPENINGS: { id: BoardOpen; label: string }[] = [
  { id: 'last', label: "Là où j'étais" },
  { id: 'fit', label: 'Tout afficher' },
]

/** Une rangée de pastilles rondes de couleur : celle qui est choisie est entourée. */
function Swatches({ items, value, onChange, label }: { items: { id: string; label: string; background: string }[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2.5">
      {items.map((it) => {
        const active = it.id === value
        return (
          <button
            key={it.id}
            role="radio"
            aria-checked={active}
            title={it.label}
            aria-label={it.label}
            onClick={() => onChange(it.id)}
            className="h-8 w-8 rounded-full border transition-transform hover:scale-105"
            style={{ background: it.background, borderColor: 'var(--border)', outline: active ? '2px solid var(--accent)' : 'none', outlineOffset: 2 }}
          />
        )
      })}
    </div>
  )
}

/** Quelques réglages rapides pour changer un peu l'interface. */
export function InterfaceSettings() {
  const theme = useApp((s) => s.theme)
  const themeMode = useApp((s) => s.themeMode)
  const setThemeMode = useApp((s) => s.setThemeMode)
  const [accent, setAccentState] = useState(loadAccent)
  const [scale, setScale] = useState(() => nearestTextSize(loadTextScale()))
  const [motion, setMotionState] = useState(loadMotion)
  const [board, setBoard] = useState(loadBoardPrefs)
  const updateBoard = (patch: Partial<typeof board>) => setBoard(saveBoardPrefs(patch))

  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <SettingsHeader title="Interface" subtitle="Quelques réglages rapides pour adapter Form à ton écran et à tes yeux. Ils s'appliquent tout de suite." />

      <SettingsSection title="Thème" description="Clair, sombre, ou « Auto » : Form suit le mode de Windows et change tout seul, par exemple le soir.">
        <SegmentedBar items={THEMES} value={themeMode} label="Thème" onChange={setThemeMode} />
      </SettingsSection>

      <SettingsSection title="Couleur d'accent" description="La couleur des boutons principaux, des choix actifs et des barres.">
        <Swatches
          label="Couleur d'accent"
          value={accent}
          onChange={(id) => { setAccentState(id); setAccent(id) }}
          items={ACCENTS.map((a) => ({ id: a.id, label: a.label, background: theme === 'dark' ? a.dark : a.light }))}
        />
      </SettingsSection>

      <SettingsSection title="Taille du texte" description="Agrandit ou réduit tout ce qui est écrit dans Form (menus, pages, réglages).">
        <SegmentedBar items={SIZE_ITEMS} value={String(scale)} label="Taille du texte" onChange={(id) => { setScale(Number(id)); setTextScale(Number(id)) }} />
      </SettingsSection>

      <SettingsSection title="Animations" description="Pour une interface plus posée, ou si les mouvements te fatiguent. Les indicateurs de chargement continuent de tourner.">
        <SegmentedBar items={MOTIONS} value={motion} label="Animations" onChange={(id) => { setMotionState(id); setMotion(id) }} />
      </SettingsSection>

      <SettingsSection title="Moodboards" description="Ces réglages valent pour les nouveaux moodboards et pour ceux dont tu n'as jamais changé le fond. Ils s'appliquent à la prochaine ouverture d'un moodboard.">
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-sm font-medium">Fond de la toile</div>
            <SegmentedBar items={PATTERNS} value={board.pattern} label="Fond de la toile" onChange={(pattern) => updateBoard({ pattern })} />
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">Couleur du fond</div>
            <Swatches
              label="Couleur du fond"
              value={board.bg}
              onChange={(bg) => updateBoard({ bg })}
              items={BOARD_BACKGROUNDS.map((b) => ({ id: b.id, label: b.label, background: b.id === 'theme' ? 'linear-gradient(135deg, #ffffff 50%, #1f1f1f 50%)' : b.id }))}
            />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">Aimantation</div>
            <p className="mb-2 text-xs text-[var(--fg-muted)]">Les éléments s'alignent sur les autres (bords et centres) quand tu les déplaces. Ctrl pendant le déplacement la coupe un instant.</p>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedBar items={SNAP} value={board.snap ? 'on' : 'off'} label="Aimantation" onChange={(id) => updateBoard({ snap: id === 'on' })} />
              {board.snap && <SegmentedBar items={STRENGTHS} value={board.snapStrength} label="Force de l'aimant" onChange={(snapStrength) => updateBoard({ snapStrength })} />}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">À l'ouverture d'un moodboard</div>
            <SegmentedBar items={OPENINGS} value={board.open} label="À l'ouverture d'un moodboard" onChange={(open) => updateBoard({ open })} />
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}
