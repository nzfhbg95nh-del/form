import { useEffect, useState } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { backupFileName, DEFAULT_KEEP, joinPath, parseKeep, restoreBackup, todayISO } from '@/lib/backup'
import { notify } from '@/lib/notify'
import { isTauri } from '@/lib/repo'
import { useApp } from '@/store/app'

export function GeneralSettings() {
  const repo = useApp((s) => s.repo)
  const [dir, setDir] = useState<string | null>(null)
  const [last, setLast] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [reminders, setReminders] = useState(true)
  const [keep, setKeep] = useState(DEFAULT_KEEP)
  const checkUpdates = useApp((s) => s.checkUpdates)
  const available = useApp((s) => s.availableUpdate)
  const desktop = isTauri()

  useEffect(() => {
    void repo?.getSetting('backup_dir').then(setDir)
    void repo?.getSetting('last_backup_date').then(setLast)
    void repo?.getSetting('reminders_enabled').then((v) => setReminders(v !== '0'))
    void repo?.getSetting('backup_keep').then((v) => setKeep(parseKeep(v)))
  }, [repo])

  const run = async (fn: () => Promise<string | void>) => {
    try {
      const m = await fn()
      if (m) setMsg(m)
    } catch (e) {
      setMsg(`Erreur : ${String(e)}`)
    }
  }

  const chooseFolder = () =>
    run(async () => {
      const chosen = await open({ directory: true, title: 'Dossier de sauvegarde (OneDrive, Google Drive…)' })
      if (typeof chosen === 'string' && repo) {
        await repo.setSetting('backup_dir', chosen)
        setDir(chosen)
        return 'Dossier enregistré. La sauvegarde se fera automatiquement une fois par jour.'
      }
    })

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
        title: 'Exporter toutes mes données',
        defaultPath: backupFileName(todayISO()),
        filters: [{ name: 'Base Form', extensions: ['db'] }],
      })
      if (target) {
        await repo.backupTo(target)
        return 'Export terminé.'
      }
    })

  const searchUpdate = () =>
    run(async () => {
      const result = await checkUpdates()
      if (result === 'found') return 'Une nouvelle version est disponible : un bandeau en haut de la fenêtre te propose de l\u2019installer.'
      if (result === 'none') return 'Form est à jour.'
      return `Impossible de vérifier : ${result.error}`
    })

  const restore = () =>
    run(async () => {
      const chosen = await open({
        title: 'Choisir la sauvegarde à restaurer',
        defaultPath: dir ?? undefined,
        filters: [{ name: 'Sauvegarde Form', extensions: ['db'] }],
      })
      if (typeof chosen !== 'string') return
      const ok = window.confirm(
        'Restaurer cette sauvegarde ?\n\n' + chosen + '\n\n' +
        'Tout ce que tu as fait depuis cette sauvegarde sera remplacé par son contenu. ' +
        'Ta base actuelle est gardée de côté (fichier « form.avant-restauration-… »). Form va se fermer puis se rouvrir tout seul.',
      )
      if (!ok) return 'Restauration annulée.'
      await restoreBackup(chosen)
    })

  const btn = 'rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'

  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <h1 className="mb-6 text-3xl font-bold">Général</h1>

      <h2 className="mb-2 text-lg font-semibold">Rappels de tâches</h2>
      <label className="mb-2 flex items-center gap-2 text-sm">
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
      <p className="mb-2 text-xs text-[var(--fg-muted)]">
        Les rappels ne fonctionnent que lorsque Form est ouvert. Une tâche n'est rappelée qu'une fois par jour.
      </p>
      <button
        className="mb-8 rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40"
        disabled={!desktop}
        onClick={() => void run(async () => ((await notify('Form', 'Les notifications fonctionnent.')) ? 'Notification envoyée.' : "Impossible d'envoyer la notification : vérifie que Windows autorise les notifications pour Form."))}
      >
        Envoyer une notification de test
      </button>

      <h2 className="mb-2 text-lg font-semibold">Mises à jour</h2>
      <p className="mb-2 text-sm">
        Version installée : <strong>{__APP_VERSION__}</strong>
        {available && <span className="text-[var(--fg-muted)]"> — la version {available.version} est disponible</span>}
      </p>
      <p className="mb-3 text-xs text-[var(--fg-muted)]">
        Form cherche tout seul une nouvelle version au démarrage, puis toutes les 6 heures. Rien n'est installé sans ton clic.
      </p>
      <button className="mb-8 rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40" disabled={!desktop} onClick={searchUpdate}>
        Rechercher une mise à jour
      </button>

      <h2 className="mb-2 text-lg font-semibold">Sauvegarde</h2>
      {!desktop && (
        <p className="mb-3 text-sm text-[var(--fg-muted)]">La sauvegarde n'est disponible que dans l'application Windows.</p>
      )}
      <p className="mb-3 text-sm">
        Dossier : <strong>{dir ?? 'aucun dossier choisi'}</strong>
        {last && <span className="text-[var(--fg-muted)]"> — dernière sauvegarde automatique : {last}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={!desktop} onClick={chooseFolder}>Choisir le dossier</button>
        <button className={btn} disabled={!desktop || !dir} onClick={backupNow}>Sauvegarder maintenant</button>
        <button className={btn} disabled={!desktop} onClick={exportAll}>Exporter tout</button>
        <button className={btn} disabled={!desktop} onClick={restore}>Restaurer une sauvegarde…</button>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        Garder les
        <input
          type="number"
          min={5}
          max={365}
          value={keep}
          disabled={!desktop}
          onChange={(e) => setKeep(Number(e.target.value))}
          onBlur={() => {
            const n = parseKeep(String(keep))
            setKeep(n)
            void repo?.setSetting('backup_keep', String(n))
          }}
          className="w-20 rounded border border-[var(--border)] bg-transparent px-2 py-1"
        />
        dernières sauvegardes automatiques (les plus anciennes sont supprimées du dossier).
      </label>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </div>
  )
}
