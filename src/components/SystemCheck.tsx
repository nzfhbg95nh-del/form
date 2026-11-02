import { invoke } from '@tauri-apps/api/core'
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { videosWithoutThumb } from '@/biblio/lib/videoThumbs.ts'
import { useAi } from '@/biblio/store/ai.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { buildChecks, warnings, type Check, type CheckLevel } from '@/lib/diagnostic'
import { isTauri } from '@/lib/repo'
import { useApp } from '@/store/app'

const ICON: Record<CheckLevel, { Icon: typeof Info; color: string }> = {
  ok: { Icon: CheckCircle2, color: '#2f9e57' },
  warn: { Icon: AlertTriangle, color: '#d9822b' },
  info: { Icon: Info, color: 'var(--fg-muted)' },
}

/** Les vidéos que cette fenêtre sait lire (sert à savoir si les miniatures de vidéos sont possibles ici). */
function canPlay(type: string): boolean {
  try {
    return document.createElement('video').canPlayType(type) !== ''
  } catch {
    return false
  }
}

/** « Cet ordinateur » : ce qui marche et ce qui manque ici, avec quoi faire. */
export function SystemCheck() {
  const repo = useApp((s) => s.repo)
  const root = useLibrary((s) => s.root)
  const layout = useLibrary((s) => s.layout)
  const aiStatus = useAi((s) => s.status)
  const provider = useAi((s) => s.provider)
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [busy, setBusy] = useState(false)

  const run = useCallback(async () => {
    if (!isTauri()) return
    setBusy(true)
    try {
      const exists = (path: string) => invoke<boolean>('library_dir_exists', { path }).catch(() => false)
      const backupDir = (await repo?.getSetting('backup_dir')) ?? null
      const libraryFound = root.trim() ? await exists(root) : false
      const free = libraryFound ? await invoke<number | null>('library_disk_free', { path: root }).catch(() => null) : null
      setChecks(
        buildChecks({
          libraryRoot: root,
          libraryFound,
          cacheInLibrary: layout ? layout.cache_in_library : null,
          freeBytes: free,
          backupDir,
          backupFound: backupDir ? await exists(backupDir) : null,
          canPlayH264: canPlay('video/mp4; codecs="avc1.42E01E"'),
          canPlayHevc: canPlay('video/mp4; codecs="hvc1.1.6.L93.B0"'),
          ffmpeg: await invoke<boolean>('system_ffmpeg').catch(() => null),
          aiProvider: provider || null,
          aiModelReady: aiStatus ? aiStatus.model_ready : null,
          withoutThumb: libraryFound ? (await videosWithoutThumb().catch(() => [])).length : null,
        }),
      )
    } finally {
      setBusy(false)
    }
  }, [repo, root, layout, aiStatus, provider])

  useEffect(() => {
    void useLibrary.getState().init()
    void useAi.getState().init(false)
  }, [])
  useEffect(() => {
    void run()
  }, [run])

  if (!isTauri()) return <p className="text-sm text-[var(--fg-muted)]">Le diagnostic n'est disponible que dans l'application Windows.</p>
  if (!checks) return <p className="text-sm text-[var(--fg-muted)]">Vérification…</p>

  const n = warnings(checks)
  return (
    <div>
      <p className="mb-3 text-sm">{n === 0 ? 'Tout est en ordre sur cet ordinateur.' : `${n} point${n > 1 ? 's' : ''} à regarder sur cet ordinateur.`}</p>
      <ul className="space-y-2">
        {checks.map((c) => {
          const { Icon, color } = ICON[c.level]
          return (
            <li key={c.id} className="flex gap-2.5 text-sm">
              <Icon size={16} className="mt-0.5 shrink-0" style={{ color }} />
              <div className="min-w-0">
                <div className="font-medium">{c.title}</div>
                <div className="break-words text-xs text-[var(--fg-muted)]">{c.detail}</div>
              </div>
            </li>
          )
        })}
      </ul>
      <button className="btn mt-4" onClick={() => void run()} disabled={busy}>
        <RefreshCw size={14} className={busy ? 'spin' : ''} /> Revérifier
      </button>
    </div>
  )
}
