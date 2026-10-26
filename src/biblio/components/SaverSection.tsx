import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { Download, Square } from 'lucide-react'
import { buildJobs, cookieAge, cookieNote, EMPTY_SAVER, loadSaverSettings, saveSaverSettings, type SaverSettings } from '@/biblio/lib/saver.ts'
import { useLibrary } from '@/biblio/store/library.ts'

const nf = new Intl.NumberFormat('fr-FR')
const input = 'min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]'
const inputStyle = { borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }
const MAX_LINES = 200

interface Line {
  text: string
  kind: string
}

/** Un fichier cookies.txt : son chemin, un bouton pour le choisir, et un avertissement s'il est vieux ou introuvable. */
function CookieRow({ label, value, note, disabled, onChange }: { label: string; value: string; note: string | null; disabled: boolean; onChange: (path: string) => void }) {
  const pick = async () => {
    const picked = await open({ multiple: false, directory: false, filters: [{ name: 'Cookies (.txt)', extensions: ['txt'] }], defaultPath: value || undefined })
    if (typeof picked === 'string') onChange(picked)
  }
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-sm" style={{ color: 'var(--fg-muted)' }}>{label}</span>
        <input className={input} style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Fichier cookies.txt" disabled={disabled} aria-label={label} />
        <button className="btn" onClick={() => void pick()} disabled={disabled}>Choisir…</button>
      </div>
      {note && <p className="ml-[7.5rem] mt-1 text-xs" style={{ color: '#d9730d' }}>{note}</p>}
    </div>
  )
}

/**
 * Télécharger mes enregistrements Instagram et mes épingles Pinterest (ce que faisait Social Saver) : même méthode, mêmes dossiers, mêmes noms de fichiers,
 * mêmes pauses. Seules les nouveautés sont téléchargées ; la bibliothèque se met à jour toute seule ensuite.
 */
export function SaverSection() {
  const root = useLibrary((s) => s.root)
  const update = useLibrary((s) => s.update)
  const [s, setS] = useState<SaverSettings>(EMPTY_SAVER)
  const [loaded, setLoaded] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const [ages, setAges] = useState<{ ig: number | null; pin: number | null }>({ ig: null, pin: null })
  const [running, setRunning] = useState(false)
  const [counts, setCounts] = useState({ new: 0, skipped: 0 })
  const [lines, setLines] = useState<Line[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadSaverSettings().then(({ settings, prefilled: p }) => {
      setS(settings)
      setPrefilled(p)
      setLoaded(true)
    })
  }, [])
  useEffect(() => {
    void Promise.all([cookieAge(s.igCookies), cookieAge(s.pinCookies)]).then(([ig, pin]) => setAges({ ig, pin }))
  }, [s.igCookies, s.pinCookies])

  useEffect(() => {
    const offs: (() => void)[] = []
    let gone = false
    const add = (p: Promise<() => void>) => void p.then((off) => (gone ? off() : offs.push(off)))
    add(listen<Line>('saver-line', (e) => setLines((l) => [...l, e.payload].slice(-MAX_LINES))))
    add(listen<{ new: number; skipped: number }>('saver-count', (e) => setCounts(e.payload)))
    add(listen<{ error: string | null; stopped: boolean; new: number; skipped: number }>('saver-done', (e) => {
      const d = e.payload
      setRunning(false)
      setCounts({ new: d.new, skipped: d.skipped })
      if (d.error) setError(d.error)
      setMessage(
        d.stopped
          ? `Arrêté. ${nf.format(d.new)} nouveau${d.new > 1 ? 'x' : ''} fichier${d.new > 1 ? 's' : ''} reçu${d.new > 1 ? 's' : ''}.`
          : `Terminé : ${nf.format(d.new)} nouveau${d.new > 1 ? 'x' : ''}, ${nf.format(d.skipped)} déjà présent${d.skipped > 1 ? 's' : ''}.`,
      )
      // De nouveaux fichiers sont arrivés : la bibliothèque les lit (miniatures, analyse…).
      if (d.new > 0 && !d.error) void update()
    }))
    return () => {
      gone = true
      offs.forEach((off) => off())
    }
  }, [update])
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines])

  const change = (patch: Partial<SaverSettings>) => setS((prev) => ({ ...prev, ...patch }))

  const start = async () => {
    setError(null)
    setMessage(null)
    const { jobs, problem } = buildJobs(s)
    if (problem) return setError(problem)
    if (!root) return setError('Le dossier de la bibliothèque est inconnu : choisis-le plus haut dans cette page.')
    setLines([])
    setCounts({ new: 0, skipped: 0 })
    try {
      await saveSaverSettings(s)
      const started = await invoke<boolean>('saver_start', { outDir: root, jobs })
      setRunning(started)
      if (!started) setError('Un téléchargement est déjà en cours.')
    } catch (e) {
      setError(String(e))
    }
  }

  const igNote = s.doIg ? cookieNote(s.igCookies, ages.ig) : null
  const pinNote = s.doPin ? cookieNote(s.pinCookies, ages.pin) : null

  return (
    <div className="py-4">
      <h2 className="text-base font-semibold">Télécharger mes enregistrements</h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
        Form télécharge tes enregistrés Instagram et tes épingles Pinterest dans ton dossier d'images ({root || 'dossier non choisi'}), comme le faisait Social Saver.
        Seules les nouveautés sont téléchargées. Il utilise tes fichiers <b>cookies.txt</b> (jamais ton mot de passe) et fait des pauses entre les fichiers pour ne pas gêner ton compte.
        Les cookies expirent vite : refais l'export depuis Chrome avant une session.
      </p>
      {prefilled && <p className="mt-2 text-xs" style={{ color: 'var(--fg-muted)' }}>Réglages repris de ton Social Saver (qui n'a pas été modifié).</p>}

      {loaded && (
        <>
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={s.doIg} onChange={(e) => change({ doIg: e.target.checked })} disabled={running} /> Instagram : mes enregistrés
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="w-28 shrink-0 text-sm" style={{ color: 'var(--fg-muted)' }}>Pseudo</span>
              <input className={input} style={inputStyle} value={s.igUser} onChange={(e) => change({ igUser: e.target.value })} placeholder="ton pseudo Instagram" disabled={running || !s.doIg} aria-label="Pseudo Instagram" />
            </div>
            <CookieRow label="Cookies" value={s.igCookies} note={igNote} disabled={running || !s.doIg} onChange={(igCookies) => change({ igCookies })} />
          </div>

          <div className="mt-5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={s.doPin} onChange={(e) => change({ doPin: e.target.checked })} disabled={running} /> Pinterest : mes épingles et mes tableaux
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="w-28 shrink-0 text-sm" style={{ color: 'var(--fg-muted)' }}>Lien du profil</span>
              <input className={input} style={inputStyle} value={s.pinUrl} onChange={(e) => change({ pinUrl: e.target.value })} placeholder="https://www.pinterest.com/monpseudo/ (ou un seul tableau)" disabled={running || !s.doPin} aria-label="Lien du profil Pinterest" />
            </div>
            <CookieRow label="Cookies" value={s.pinCookies} note={pinNote} disabled={running || !s.doPin} onChange={(pinCookies) => change({ pinCookies })} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" onClick={() => void start()} disabled={running}><Download size={16} /> {running ? 'Téléchargement…' : 'Télécharger les nouveautés'}</button>
            {running && <button className="btn" onClick={() => void invoke('saver_stop')}><Square size={14} /> Arrêter</button>}
            {(running || message) && <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>{running ? `${nf.format(counts.new)} nouveaux · ${nf.format(counts.skipped)} déjà présents` : message}</span>}
          </div>
          {error && <p className="mt-3 text-sm" style={{ color: '#d44c47' }}>{error}</p>}
          {lines.length > 0 && (
            <div ref={logRef} className="mt-3 max-h-56 overflow-auto rounded-md border p-2 font-mono text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-side)' }} aria-label="Journal du téléchargement">
              {lines.map((l, i) => (
                <div key={i} className="whitespace-pre-wrap break-all" style={{ color: l.kind === 'log' ? '#d9730d' : l.kind === 'title' ? 'var(--fg)' : 'var(--fg-muted)', fontWeight: l.kind === 'title' ? 600 : 400 }}>{l.text}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
