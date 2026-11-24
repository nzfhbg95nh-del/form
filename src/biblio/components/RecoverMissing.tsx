import { useEffect, useRef, useState } from 'react'
import { Download, Square } from 'lucide-react'
import { listMissing, RECOVERABLE, recoverMissing, recoverUrl, type RecoverProgress, type RecoverResult } from '@/biblio/lib/recover.ts'
import { useLibrary } from '@/biblio/store/library.ts'
import { useToast } from '@/biblio/store/toast.ts'

const nf = new Intl.NumberFormat('fr-FR')

/** Le message de fin, en français simple. */
export function recoverMessage(r: RecoverResult): string {
  const parts = [r.restored > 0 ? `${nf.format(r.restored)} fichier${r.restored > 1 ? 's' : ''} retrouvé${r.restored > 1 ? 's' : ''}` : 'Aucun fichier retrouvé']
  if (r.failed > 0) parts.push(`${nf.format(r.failed)} plus en ligne (supprimés par leur auteur, ou vidéos)`)
  return `${parts.join(', ')}.${r.stoppedBecause ? ` ${r.stoppedBecause}` : ''}`
}

/** Réglages › Bibliothèque : retélécharger tous les fichiers introuvables qui viennent d'Instagram ou de Pinterest. */
export function RecoverMissing() {
  const root = useLibrary((s) => s.root)
  const missingTotal = useLibrary((s) => s.stats?.missing ?? 0)
  const [counts, setCounts] = useState<{ online: number; pinterest: number; manual: number } | null>(null)
  const [progress, setProgress] = useState<RecoverProgress | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const stop = useRef(false)

  useEffect(() => {
    void listMissing().then((list) => {
      const online = list.filter((f) => RECOVERABLE.has(f.source) && recoverUrl(f) !== null).length
      const pinterest = list.filter((f) => f.source === 'pinterest').length
      setCounts({ online, pinterest, manual: list.length - online - pinterest })
    }).catch(() => setCounts(null))
  }, [missingTotal])

  if (missingTotal === 0) return null
  const run = async () => {
    stop.current = false
    setResult(null)
    setProgress({ done: 0, total: 0, restored: 0, failed: 0, label: '' })
    try {
      const r = await recoverMissing(root, { onProgress: setProgress, shouldStop: () => stop.current })
      if (r.restored > 0) await useLibrary.getState().update()
      setResult(recoverMessage(r))
    } catch (e) {
      setResult(`La récupération a échoué : ${String(e)}`)
    } finally {
      setProgress(null)
    }
  }
  const busy = progress !== null

  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] p-4 text-sm">
      <div className="mb-1 font-medium">Retrouver les fichiers introuvables</div>
      <p className="mb-3 text-[var(--fg-muted)]">
        {counts ? <>{nf.format(counts.online)} viennent d’Instagram : Form peut les retélécharger depuis le post d’origine et les remettre à leur place. </> : null}
        {counts && counts.pinterest > 0 ? <>{nf.format(counts.pinterest)} viennent de Pinterest : pour l’instant, Pinterest refuse de redonner une épingle seule, Form ne peut pas les récupérer. </> : null}
        {counts && counts.manual > 0 ? <>{nf.format(counts.manual)} ont été ajoutés à la main : sans source, ils ne peuvent pas être retéléchargés. </> : null}
        Compte quelques secondes par post (Form fait des pauses pour ne pas se faire bloquer) ; tu peux arrêter et reprendre plus tard.
      </p>
      {busy ? (
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-side)]"><div className="h-full bg-[#2383e2]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
          <span className="shrink-0 tabular-nums text-[var(--fg-muted)]">{progress.label} {nf.format(progress.done)} / {nf.format(progress.total)} · {nf.format(progress.restored)} retrouvés</span>
          <button className="btn !py-0.5 !text-xs" onClick={() => { stop.current = true }}><Square size={12} /> Arrêter</button>
        </div>
      ) : (
        <button className="btn" disabled={!counts || counts.online === 0} onClick={() => void run()}><Download size={14} /> Retélécharger depuis Instagram</button>
      )}
      {result && <p className="mt-2">{result}</p>}
    </div>
  )
}

/** Vue détail d'une image introuvable : retélécharger cette image seulement. */
export function RecoverOne({ blockId, onDone }: { blockId: string; onDone: () => void }) {
  const root = useLibrary((s) => s.root)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const r = await recoverMissing(root, { blockIds: [blockId] })
      if (r.restored > 0) await useLibrary.getState().update()
      useToast.getState().show(r.noSource > 0 && r.restored === 0 && r.failed === 0 ? 'Cette image a été ajoutée à la main : pas de source pour la retélécharger.' : recoverMessage(r))
      onDone()
    } finally {
      setBusy(false)
    }
  }
  return <button className="btn mt-3" disabled={busy} onClick={() => void run()}><Download size={14} /> {busy ? 'Téléchargement…' : 'Retélécharger depuis l’original'}</button>
}
