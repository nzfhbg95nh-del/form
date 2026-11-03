import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Icon } from '@/components/Icon'
import { useApp } from '@/store/app'

export type ButtonAction = 'url' | 'page' | 'newpage'

export interface ButtonProps {
  label: string
  action: ButtonAction
  target: string
}

const ACTIONS: { id: ButtonAction; label: string }[] = [
  { id: 'url', label: 'Ouvrir un lien' },
  { id: 'page', label: 'Ouvrir une page' },
  { id: 'newpage', label: 'Créer une page dans celle-ci' },
]

/** Bloc « Bouton » : un bouton dans la page qui ouvre un lien, ouvre une page, ou crée une page. La roue dentée règle le texte et l'action. */
export function ButtonBlock({ props, update }: { props: ButtonProps; update: (p: Partial<ButtonProps>) => void }) {
  const objects = useApp((s) => s.objects)
  const selectedId = useApp((s) => s.selectedId)
  const select = useApp((s) => s.select)
  const createPage = useApp((s) => s.createPage)
  const [setup, setSetup] = useState(!props.label)
  const pages = objects.filter((o) => (o.type === 'page' || o.type === 'database' || o.type === 'moodboard') && !o.deleted_at)

  const run = async () => {
    if (props.action === 'page') {
      if (props.target && objects.some((o) => o.id === props.target && !o.deleted_at)) select(props.target)
      else useApp.setState({ toast: 'Choisis d’abord la page à ouvrir (roue dentée).' })
    } else if (props.action === 'newpage') {
      await createPage(selectedId)
    } else {
      const url = /^[a-z][a-z0-9+.-]*:/i.test(props.target) ? props.target : `https://${props.target}`
      if (!props.target.trim()) return void useApp.setState({ toast: 'Écris d’abord l’adresse du lien (roue dentée).' })
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener')
        await openUrl(url)
      } catch {
        window.open(url, '_blank', 'noopener')
      }
    }
  }

  const field = 'w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--accent)]'
  return (
    <div contentEditable={false} className="relative flex w-full items-center gap-2 py-1">
      <button type="button" className="btn btn-primary" onClick={() => void run()}>{props.label || 'Bouton'}</button>
      <button type="button" aria-label="Régler le bouton" title="Régler le bouton" aria-expanded={setup} onClick={() => setSetup((o) => !o)} className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]">
        <Settings2 size={15} />
      </button>
      {setup && (
        <div className="absolute left-0 top-full z-20 mt-1 flex w-72 flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 shadow-lg" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setSetup(false) }}>
          <label className="text-xs text-[var(--fg-muted)]">Texte du bouton
            <input autoFocus className={field + ' mt-1'} value={props.label} placeholder="Bouton" onChange={(e) => update({ label: e.target.value })} />
          </label>
          <label className="text-xs text-[var(--fg-muted)]">Ce qu'il fait
            <select className={field + ' mt-1'} value={props.action} onChange={(e) => update({ action: e.target.value as ButtonAction, target: '' })}>
              {ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          {props.action === 'url' && (
            <label className="text-xs text-[var(--fg-muted)]">Adresse
              <input className={field + ' mt-1'} value={props.target} placeholder="https://…" onChange={(e) => update({ target: e.target.value })} />
            </label>
          )}
          {props.action === 'page' && (
            <label className="text-xs text-[var(--fg-muted)]">Page à ouvrir
              <select className={field + ' mt-1'} value={props.target} onChange={(e) => update({ target: e.target.value })}>
                <option value="">Choisir…</option>
                {pages.map((o) => <option key={o.id} value={o.id}>{o.title || 'Nouvelle page'}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="btn self-end !px-3 !py-1 !text-xs" onClick={() => setSetup(false)}>OK</button>
        </div>
      )}
      {props.action === 'page' && !setup && props.target && <Icon value={objects.find((o) => o.id === props.target)?.icon ?? '📄'} size={14} />}
    </div>
  )
}