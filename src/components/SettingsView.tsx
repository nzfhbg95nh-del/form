import { useEffect, useState } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { SettingsHeader, SettingsSection } from '@/components/SettingsUi'
import { SystemCheck } from '@/components/SystemCheck'
import { backupFileName, DEFAULT_KEEP, joinPath, parseKeep, restoreBackup, todayISO } from '@/lib/backup'
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
  const [keep, setKeep] = useState(DEFAULT_KEEP)
  const keepPagesOpen = useApp((s) => s.keepPagesOpen)
  const setKeepPagesOpen = useApp((s) => s.setKeepPagesOpen)
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

      <SettingsSection title="Mes pages" description="Quand tu ouvres une page, que devient celle que tu quittes ?">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={keepPagesOpen} onChange={(e) => setKeepPagesOpen(e.target.checked)} />
          <span>
            Garder ouverte la page que je quitte
            <span className={'block text-xs ' + muted}>Chaque page s'ouvre dans son propre onglet (en haut de la fenêtre) : celle que tu quittes reste là, et tu peux la fermer quand tu veux. Décoché, une page prend la place de l'onglet actif, comme dans un navigateur.</span>
          </span>
        </label>
      </SettingsSection>

      <SettingsSection title="Cet ordinateur" description="Ce qui marche et ce qui manque ici (dossiers, disque, vidéos, programmes), avec quoi faire. Utile quand tu installes Form sur un autre ordinateur.">
        <SystemCheck />
      </SettingsSection>

      <SettingsSection
        title="Sauvegarde de mes données"
        description="Une copie de ta base (recettes, pages, devis, factures, réglages) est faite automatiquement une fois par jour. Tes images et tes vidéos ne sont pas dedans : elles sont dans ta bibliothèque."
      >
        {!desktop && <p className={'mb-3 text-sm ' + muted}>La sauvegarde n'est disponible que dans l'application Windows.</p>}
        <p className="mb-3 text-sm">
          Dossier : <strong className="break-all">{dir ?? 'aucun dossier choisi'}</strong>
          {last && <span className={muted}> — dernière sauvegarde automatique : {last.split('-').reverse().join('/')}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={!desktop} onClick={chooseFolder}>Choisir le dossier</button>
          <button className="btn" disabled={!desktop || !dir} onClick={backupNow}>Sauvegarder maintenant</button>
          <button className="btn" disabled={!desktop} onClick={exportAll}>Enregistrer une copie…</button>
          <button className="btn" disabled={!desktop} onClick={restore}>Restaurer une sauvegarde…</button>
        </div>
        <label className="mt-4 flex flex-wrap items-center gap-2 text-sm">
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
            className="lib-input w-20 rounded-lg border px-2 py-1"
          />
          dernières sauvegardes automatiques (les plus anciennes sont supprimées du dossier).
        </label>
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
