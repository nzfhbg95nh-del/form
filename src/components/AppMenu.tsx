import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { copyText, pageLink, windowActions } from '@/lib/windowActions'
import { useApp } from '@/store/app'

interface Entry {
  label: string
  shortcut?: string
  action?: () => void | Promise<unknown>
  separator?: boolean
  disabled?: boolean
}


/** Exécute une commande d'édition dans le texte en cours (Annuler, Copier…). */
const edit = (command: string) => () => { document.execCommand(command) }
const paste = async () => {
  try {
    document.execCommand('insertText', false, await navigator.clipboard.readText())
  } catch { /* presse-papiers refusé */ }
}

/** Logo provisoire dans le style de Notion (tuile claire, lettre en gras, trait noir). À remplacer par celui de Victor. */
export function FormLogo() {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-[1.5px] border-[var(--fg)] bg-white font-serif text-[17px] font-black leading-none text-black shadow-[1.5px_1.5px_0_var(--fg)]"
    >
      F
    </span>
  )
}

export function AppMenu() {
  const s = useApp()
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<string | null>(null)
  const [about, setAbout] = useState(false)
  const page = s.objects.find((o) => o.id === s.selectedId && !o.deleted_at)

  const say = (text: string) => {
    useApp.setState({ toast: text })
    window.setTimeout(() => useApp.setState({ toast: null }), 2500)
  }
  const needsApp = async (fn: () => Promise<boolean>) => { if (!(await fn())) say("Disponible seulement dans l'application Windows.") }

  const menus: Record<string, Entry[]> = {
    Fichier: [
      { label: 'Nouvel onglet', shortcut: 'Ctrl+T', action: () => s.setSearch(true, true) },
      { label: 'Rouvrir le dernier onglet fermé', shortcut: 'Ctrl+Maj+T', action: s.reopenTab, disabled: s.closedTabs.length === 0 },
      { label: '', separator: true },
      { label: "Fermer l'onglet", shortcut: 'Ctrl+W', action: () => s.closeTabAt(s.tabs.active), disabled: s.tabs.ids.length < 2 },
      { label: '', separator: true },
      { label: 'Imprimer…', shortcut: 'Ctrl+P', action: () => window.print() },
      { label: '', separator: true },
      { label: 'Quitter', action: () => needsApp(windowActions.quit) },
    ],
    Modifier: [
      { label: 'Annuler', shortcut: 'Ctrl+Z', action: edit('undo') },
      { label: 'Rétablir', shortcut: 'Ctrl+Maj+Z', action: edit('redo') },
      { label: '', separator: true },
      { label: 'Couper', shortcut: 'Ctrl+X', action: edit('cut') },
      { label: 'Copier', shortcut: 'Ctrl+C', action: edit('copy') },
      { label: 'Copier le lien vers la page actuelle', shortcut: 'Ctrl+L', disabled: !page, action: async () => { if (page && (await copyText(pageLink(page.id)))) say('Lien copié : colle-le dans la recherche (Ctrl+K) pour revenir à cette page.') } },
      { label: 'Copier le nom de la page actuelle', shortcut: 'Alt+Ctrl+L', disabled: !page, action: async () => { if (page && (await copyText(page.title || 'Nouvelle page'))) say('Nom copié.') } },
      { label: 'Coller', shortcut: 'Ctrl+V', action: paste },
      { label: '', separator: true },
      { label: 'Tout sélectionner', shortcut: 'Ctrl+A', action: edit('selectAll') },
    ],
    Afficher: [
      { label: 'Recharger', shortcut: 'Ctrl+R', action: () => window.location.reload() },
      { label: "Forcer l'actualisation", action: () => window.location.reload() },
      { label: '', separator: true },
      { label: 'Afficher/masquer la barre latérale', shortcut: 'Ctrl+\\', action: s.toggleSidebar },
      { label: '', separator: true },
      { label: 'Zoomer', shortcut: 'Ctrl++', action: () => s.setZoom(s.zoom + 0.1) },
      { label: 'Dézoomer', shortcut: 'Ctrl+-', action: () => s.setZoom(s.zoom - 0.1) },
      { label: 'Taille réelle', shortcut: 'Ctrl+0', action: () => s.setZoom(1) },
      { label: 'Basculer en plein écran', shortcut: 'F11', action: () => needsApp(windowActions.toggleFullscreen) },
    ],
    Historique: [
      { label: 'Précédent', shortcut: 'Alt+←', action: s.goBack, disabled: s.navBack.length === 0 },
      { label: 'Suivant', shortcut: 'Alt+→', action: s.goForward, disabled: s.navForward.length === 0 },
    ],
    Fenêtre: [
      { label: 'Réduire', shortcut: 'Ctrl+M', action: () => needsApp(windowActions.minimize) },
      { label: "Afficher l'onglet précédent", shortcut: 'Ctrl+Maj+Tab', action: () => s.cycleTab(-1), disabled: s.tabs.ids.length < 2 },
      { label: "Afficher l'onglet suivant", shortcut: 'Ctrl+Tab', action: () => s.cycleTab(1), disabled: s.tabs.ids.length < 2 },
      { label: 'Agrandir', action: () => needsApp(windowActions.toggleMaximize) },
    ],
    Aide: [
      { label: 'À propos de Form', action: () => setAbout(true) },
      { label: '', separator: true },
      { label: "Copier l'ID d'installation", action: async () => {
        let id = await s.repo?.getSetting('install_id')
        if (!id) { id = crypto.randomUUID(); await s.repo?.setSetting('install_id', id) }
        if (await copyText(id)) say("ID d'installation copié.")
      } },
      { label: 'Ouvrir les réglages de sauvegarde', action: () => s.show('settings') },
    ],
  }

  const close = () => { setOpen(false); setSection(null) }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-base font-semibold hover:bg-[var(--bg-hover)]">
        <FormLogo />
        Form <ChevronDown size={14} className="text-[var(--fg-muted)]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} onContextMenu={(e) => { e.preventDefault(); close() }} />
          <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1.5 shadow-xl">
            {Object.keys(menus).map((name) => (
              <div key={name} className="relative" onMouseEnter={() => setSection(name)}>
                <button onClick={() => setSection(section === name ? null : name)} className={'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)] ' + (section === name ? 'bg-[var(--bg-hover)]' : '')}>
                  {name} <ChevronRight size={14} className="text-[var(--fg-muted)]" />
                </button>
                {section === name && (
                  <div className="absolute left-full top-0 z-50 ml-1 w-80 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1.5 shadow-xl">
                    {menus[name].map((e, i) =>
                      e.separator ? (
                        <div key={i} className="my-1 border-t border-[var(--border)]" />
                      ) : (
                        <button
                          key={e.label}
                          disabled={e.disabled}
                          onClick={() => { close(); void e.action?.() }}
                          className="flex w-full items-center justify-between gap-4 rounded-md px-3 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <span>{e.label}</span>
                          {e.shortcut && <span className="whitespace-nowrap text-xs text-[var(--fg-muted)]">{e.shortcut}</span>}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {about && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={() => setAbout(false)}>
          <div className="w-96 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-6 text-center shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-1 text-3xl font-bold">Form</div>
            <div className="mb-3 text-sm text-[var(--fg-muted)]">Version {typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '?'}</div>
            <p className="mb-4 text-sm">Le Notion du créatif freelance : pages, bases de données, moodboards, devis et factures. Tout reste sur ton PC.</p>
            <button className="rounded border border-[var(--border)] px-4 py-1.5 text-sm hover:bg-[var(--bg-hover)]" onClick={() => setAbout(false)}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  )
}
