import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Trash2 } from 'lucide-react'
import {
  blocksToDelete, defaultChoices, DEFAULT_DISTANCE, DISTANCES, isDeletable, scanDuplicates, wastedBytes, type DupeGroup, type DupeMember, type DupeMode, type ScanProgress,
} from '@/biblio/lib/dupes.ts'
import { getSetting, setSetting } from '@/biblio/lib/library.ts'
import { fileUrl, thumbPath } from '@/biblio/lib/media.ts'
import { formatBytes } from '@/biblio/lib/vectors.ts'
import { useGrid } from '@/biblio/store/grid.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { useTrash } from '@/biblio/store/trash.ts'

const nf = new Intl.NumberFormat('fr-FR')
const dateOf = (m: DupeMember) => new Date(m.mtime > 1e12 ? m.mtime : m.mtime * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const originOf = (m: DupeMember) => (m.source === 'instagram' ? `@${m.owner}` : `${m.board ?? ''} · ${m.owner}`)

/**
 * Doublons de la bibliothèque : on lance la recherche (identiques seulement, ou identiques + quasi identiques), puis, pour chaque groupe,
 * on voit les images côte à côte. La meilleure est gardée d'office ; les autres partent dans la Corbeille Windows quand on valide (récupérables).
 * Rien n'est supprimé sans ce clic.
 */
export function DuplicatesView({ onBack }: { onBack: () => void }) {
  const thumbsDir = useGrid((s) => s.thumbsDir)
  const root = useLibrary((s) => s.root)
  const purge = useTrash((s) => s.purge)
  const [mode, setMode] = useState<DupeMode>('near')
  const [distance, setDistance] = useState(DEFAULT_DISTANCE)
  const [groups, setGroups] = useState<DupeGroup[] | null>(null)
  const [choices, setChoices] = useState<Map<string, 'keep' | 'delete'>>(new Map())
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getSetting('dupes_mode').then((v) => v && setMode(v === 'exact' ? 'exact' : 'near'))
    void getSetting('dupes_distance').then((v) => {
      const n = Number(v)
      if (DISTANCES.some((d) => d.id === n)) setDistance(n)
    })
  }, [])

  const scan = async () => {
    if (!root) {
      setError('Le dossier de la bibliothèque est inconnu : ouvre d\'abord la bibliothèque.')
      return
    }
    setScanning(true)
    setError(null)
    setGroups(null)
    setProgress(null)
    void setSetting('dupes_mode', mode)
    void setSetting('dupes_distance', String(distance))
    try {
      const found = await scanDuplicates(root, mode, distance, setProgress)
      setGroups(found)
      setChoices(defaultChoices(found))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setScanning(false)
    }
  }

  const toDelete = useMemo(() => (groups ? blocksToDelete(groups, choices) : []), [groups, choices])
  const freed = useMemo(() => {
    if (!groups) return 0
    const wanted = new Set(toDelete)
    return groups.flatMap((g) => g.members).filter((m) => wanted.has(m.block)).reduce((n, m) => n + m.size, 0)
  }, [groups, toDelete])
  const savings = useMemo(() => (groups ?? []).reduce((n, g) => n + wastedBytes(g), 0), [groups])

  /** Garder / supprimer une image ; un groupe garde toujours au moins une image. */
  const toggle = (g: DupeGroup, m: DupeMember) =>
    setChoices((prev) => {
      const next = new Map(prev)
      const now = next.get(m.rel)
      if (now === 'delete') next.set(m.rel, 'keep')
      else if (isDeletable(m) && g.members.filter((x) => next.get(x.rel) !== 'delete').length > 1) next.set(m.rel, 'delete')
      return next
    })

  const dismiss = (id: number) => setGroups((gs) => gs && gs.filter((g) => g.id !== id))

  const doDelete = async () => {
    setBusy(true)
    try {
      const deletedBlocks = new Set(toDelete)
      const { failed } = await purge(toDelete)
      // Les groupes traités disparaissent de la liste ; ce qui n'a pas pu partir reste visible.
      if (failed === 0) {
        setGroups((gs) => (gs ?? []).map((g) => ({ ...g, members: g.members.filter((m) => !deletedBlocks.has(m.block)) })).filter((g) => g.members.length > 1))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setConfirm(false)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8 pb-28">
      <button className="btn" onClick={onBack}><ChevronLeft size={15} /> Paramètres</button>
      <h1 className="mt-4 text-xl font-semibold">Doublons</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
        Form cherche les images en double dans ta bibliothèque. Rien n'est supprimé sans ton accord : à la fin, les images que tu as choisies partent dans la <b>Corbeille Windows</b>, où tu peux les récupérer.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <select className="rounded-md border px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }} value={mode} onChange={(e) => setMode(e.target.value as DupeMode)} disabled={scanning} aria-label="Mode de recherche">
          <option value="exact">Identiques seulement</option>
          <option value="near">Identiques + quasi identiques (recommandé)</option>
        </select>
        {mode === 'near' && (
          <select className="rounded-md border px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }} value={distance} onChange={(e) => setDistance(Number(e.target.value))} disabled={scanning} aria-label="Ressemblance">
            {DISTANCES.map((d) => <option key={d.id} value={d.id}>Ressemblance : {d.label}</option>)}
          </select>
        )}
        <button className="btn" onClick={() => void scan()} disabled={scanning}>{scanning ? 'Recherche en cours…' : groups ? 'Relancer la recherche' : 'Chercher les doublons'}</button>
        {scanning && progress && <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>{progress.phase} : {nf.format(progress.done)} / {nf.format(progress.total)}</span>}
      </div>
      {error && <p className="mt-4 text-sm" style={{ color: '#d44c47' }}>{error}</p>}

      {groups && groups.length === 0 && <p className="mt-8 text-sm" style={{ color: 'var(--fg-muted)' }}>Aucun doublon trouvé.</p>}
      {groups && groups.length > 0 && (
        <>
          <p className="mt-6 text-sm">
            {nf.format(groups.length)} groupe{groups.length > 1 ? 's' : ''} de doublons · jusqu'à <b>{formatBytes(savings)}</b> à gagner.
          </p>
          <div className="mt-3 space-y-4">
            {groups.map((g) => (
              <section key={g.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>
                  <span>{g.kind === 'exact' ? 'Identiques' : 'Quasi identiques'} · {g.members.length} images</span>
                  <button className="ml-auto rounded px-2 py-0.5 normal-case tracking-normal hover:bg-[var(--bg-hover)]" onClick={() => dismiss(g.id)} title="Ne plus montrer ce groupe pour cette recherche">Ce ne sont pas des doublons</button>
                </div>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                  {g.members.map((m) => {
                    const deleting = choices.get(m.rel) === 'delete'
                    return (
                      <button
                        key={m.rel}
                        onClick={() => toggle(g, m)}
                        className="overflow-hidden rounded-lg border text-left"
                        style={{ borderColor: deleting ? '#d44c47' : 'var(--accent)', borderWidth: 2, opacity: deleting ? 0.7 : 1 }}
                        title={m.rel}
                      >
                        <div className="relative aspect-[4/3] w-full" style={{ background: 'var(--bg-hover)' }}>
                          {m.thumb && <img src={fileUrl(thumbPath(thumbsDir, m.thumb))} alt="" draggable={false} loading="lazy" className="h-full w-full object-contain" />}
                          <span className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-xs font-medium text-white" style={{ background: deleting ? '#d44c47' : 'var(--accent)' }}>
                            {deleting ? 'À supprimer' : 'Garder'}
                          </span>
                        </div>
                        <div className="p-2 text-xs">
                          <div className="font-medium">{m.width && m.height ? `${nf.format(m.width)} × ${nf.format(m.height)}` : m.kind === 'video' ? 'Vidéo' : '—'} · {formatBytes(m.size)}</div>
                          <div style={{ color: 'var(--fg-muted)' }}>{dateOf(m)} · {originOf(m)}</div>
                          {!isDeletable(m) && <div style={{ color: 'var(--fg-muted)' }}>Dans un carrousel : à garder (ne se supprime pas d'ici).</div>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-4 border-t px-6 py-3" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
            <span className="text-sm">{toDelete.length === 0 ? 'Rien à supprimer' : `${nf.format(toDelete.length)} image${toDelete.length > 1 ? 's' : ''} à supprimer · ${formatBytes(freed)} gagnés`}</span>
            <button className="btn" disabled={toDelete.length === 0 || busy} onClick={() => setConfirm(true)}><Trash2 size={15} /> Mettre à la Corbeille Windows…</button>
          </div>
        </>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6" onMouseDown={() => !busy && setConfirm(false)}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={{ background: 'var(--bg)' }} role="dialog" aria-label="Mettre les doublons à la Corbeille Windows" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Mettre {toDelete.length} image{toDelete.length > 1 ? 's' : ''} à la Corbeille Windows ?</h2>
            <p className="mt-2 text-sm">
              Les fichiers partent dans la <b>Corbeille Windows</b> ({formatBytes(freed)}) et Form les oublie : ils ne reviendront pas, même si Social Saver remet les fichiers.
              Les images marquées « Garder » ne sont pas touchées. Tu pourras récupérer les fichiers dans la Corbeille Windows.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn" disabled={busy} onClick={() => setConfirm(false)}>Annuler</button>
              <button className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: '#d44c47' }} disabled={busy} onClick={() => void doDelete()}>
                {busy ? 'Suppression…' : 'Mettre à la corbeille'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
