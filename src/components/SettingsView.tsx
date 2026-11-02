import { useEffect, useState } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { SettingsHeader, SettingsSection } from '@/components/SettingsUi'
import { SystemCheck } from '@/components/SystemCheck'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { backupDirs, backupFileName, joinPath, restoreBackup, todayISO } from '@/lib/backup'
import { useLibrary } from '@/biblio/store/library'
import { notify } from '@/lib/notify'
import { isTauri } from '@/lib/repo'
import { useApp } from '@/store/app'
import { askConfirm } from '@/lib/confirm'

/** Réglages généraux : la version de Form, la sauvegarde de tes données et les notifications. */
export function GeneralSettings() {
  const repo = useApp((s) => s.repo)
  const [dir, setDir] = useState<string | null>(null)
  const [last, setLast] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [reminders, setReminders] = useState(true)
  const root = useLibrary((s) => s.root)
  const desktop = isTauri()

  useEffect(() => {
    // Le dossier de sauvegarde suit la bibliothèque (« sauvegardes » dedans) ; si elle est introuvable, c'est Documents\Form sauvegardes.
    if (repo && desktop) void backupDirs(repo).then((d) => setDir(d[0] ?? null)).catch(() => setDir(null))
    void repo?.getSetting('last_backup_date').then(setLast)
    void repo?.getSetting('reminders_enabled').then((v) => setReminders(v !== '0'))
  }, [repo, desktop, root])

  const run = async (fn: () => Promise<string | void>) => {
    try {
      const m = await fn()
      if (m) setMsg(m)
    } catch (e) {
      setMsg(`Erreur : ${String(e)}`)
    }
  }

  const backupNow = () =>
    run(async () => {
      if (!repo || !dir) return
      // Nom avec l'heure pour pouvoir sauvegarder plusieurs fois le même jour.
      const n = new Date()
      const stamp = `${String(n.getHours()).padStart(2, '0')}h${String(n.getMinutes()).padStart(2, '0')}m${String(n.getSeconds()).padStart(2, '0')}`
      await repo.backupTo(joinPath(dir, backupFileName(`${todayISO()}-${stamp}`)))
      return 'Sauvegarde effectuée.'
    })

  const exportAll = () =>
    run(async () => {
      if (!repo) return
      const target = await save({
        title: 'Enregistrer une copie de mes données',
        defaultPath: backupFileName(todayISO()),
        filters: [{ name: 'Base Form', extensions: ['db'] }],
      })
      if (target) {
        await repo.backupTo(target)
        return 'Copie enregistrée.'
      }
    })

  const restore = () =>
    run(async () => {
      const chosen = await open({
        title: 'Choisir la sauvegarde à restaurer',
        defaultPath: dir ?? undefined,
        filters: [{ name: 'Sauvegarde Form', extensions: ['db'] }],
      })
      if (typeof chosen !== 'string') return
      const ok = await askConfirm(
        'Restaurer cette sauvegarde ?\n\n' + chosen + '\n\n' +
        'Tout ce que tu as fait depuis cette sauvegarde sera remplacé par son contenu. ' +
        'Ta base actuelle est gardée de côté (fichier « form.avant-restauration-… »). Form va se fermer puis se rouvrir tout seul.',
      )
      if (!ok) return 'Restauration annulée.'
      await restoreBackup(chosen)
    })

  const muted = 'text-[var(--fg-muted)]'

  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <SettingsHeader title="Général" />

      <SettingsSection title="Cet ordinateur" description="Ce qui marche et ce qui manque ici (dossiers, disque, vidéos, programmes), avec quoi faire. Utile quand tu installes Form sur un autre ordinateur.">
        <SystemCheck />
      </SettingsSection>

      <SettingsSection
        title="Sauvegarde de mes données"
        description="Une copie de ta base (recettes, pages, devis, factures, réglages) est faite toute seule une fois par jour dans le dossier « sauvegardes » de ta bibliothèque : elle voyage avec elle quand tu la déplaces. Les 30 dernières sont gardées."
      >
        {!desktop && <p className={'mb-3 text-sm ' + muted}>La sauvegarde n'est disponible que dans l'application Windows.</p>}
        <p className="mb-3 text-sm">
          Dossier : <strong className="break-all">{dir ?? '—'}</strong>
          {last && <span className={muted}> — dernière sauvegarde : {last.split('-').reverse().join('/')}</span>}
        </p>
        {dir && root.trim() && !dir.toLowerCase().startsWith(root.trim().toLowerCase()) && (
          <p className="mb-3 text-xs" style={{ color: '#d9730d' }}>Ta bibliothèque est introuvable : en attendant, les sauvegardes vont dans ce dossier de secours.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={!desktop || !dir} onClick={backupNow}>Sauvegarder maintenant</button>
          <button className="btn" disabled={!desktop || !dir} onClick={() => void run(async () => { await revealItemInDir(dir!) })}>Ouvrir le dossier</button>
          <button className="btn" disabled={!desktop} onClick={restore}>Restaurer une sauvegarde…</button>
          <button className="btn" disabled={!desktop} onClick={exportAll}>Enregistrer une copie ailleurs…</button>
        </div>
        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </SettingsSection>

      <SettingsSection
        title="Notifications"
        description="Les rappels ne fonctionnent que lorsque Form est ouvert. Une tâche n'est rappelée qu'une fois par jour."
      >
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reminders}
            onChange={(e) => {
              setReminders(e.target.checked)
              void repo?.setSetting('reminders_enabled', e.target.checked ? '1' : '0')
            }}
          />
          Me prévenir par une notification Windows quand une tâche arrive à échéance
        </label>
        <button
          className="btn disabled:opacity-40"
          disabled={!desktop}
          onClick={() => void run(async () => ((await notify('Form', 'Les notifications fonctionnent.')) ? 'Notification envoyée.' : "Impossible d'envoyer la notification : vérifie que Windows autorise les notifications pour Form."))}
        >
          Envoyer une notification de test
        </button>
      </SettingsSection>
    </div>
  )
}
