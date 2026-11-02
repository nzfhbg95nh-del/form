import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Download, Square } from 'lucide-react'
import { buildJobs, EMPTY_SAVER, loadSaverSettings, saveSaverSettings, type SaverSettings } from '@/biblio/lib/saver.ts'
import { getSetting, setSetting } from '@/biblio/lib/library.ts'
import { DOWNLOAD_FREQUENCIES, type AutoFrequency } from '@/biblio/lib/autoUpdate.ts'
import { adoptCookies, ALERT_KEY, DOWNLOAD_FREQUENCY_KEY, DOWNLOAD_LAST_DAY_KEY, downloadFrequency, loginCheck, loginClose, loginLabel, loginOpen, SITE_NAMES, type LoginStatus, type Site } from '@/biblio/lib/siteLogin.ts'
import { useAi } from '@/biblio/store/ai.ts'
import { useLibrary } from '@/biblio/store/library.ts'

const nf = new Intl.NumberFormat('fr-FR')
const input = 'min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]'
const inputStyle = { borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }
const MAX_LINES = 200

interface Line {
  text: string
  kind: string
}

/** Connexion au site dans une fenêtre de Form : Victor tape son mot de passe lui-même, Form garde la session et prépare le fichier de cookies. */
function LoginRow({ site, disabled, onFile }: { site: Site; disabled: boolean; onFile: (file: string) => void }) {
  const [status, setStatus] = useState<LoginStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wasConnected = useRef(false)
  const onFileRef = useRef(onFile)
  useEffect(() => {
    onFileRef.current = onFile
  })
  useEffect(() => {
    let gone = false
    const tick = async () => {
      try {
        const st = await loginCheck(site)
        if (gone) return
        setStatus(st)
        if (st.connected && st.cookiesFile) {
          onFileRef.current(st.cookiesFile)
          // Connexion réussie dans la fenêtre : on la referme.
          if (!wasConnected.current) void loginClose(site).catch(() => undefined)
        }
        wasConnected.current = st.connected
      } catch (e) {
        if (!gone) setError(String(e))
      }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 3000)
    return () => {
      gone = true
      window.clearInterval(timer)
    }
  }, [site])
  const name = SITE_NAMES[site]
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button className="btn" onClick={() => { setError(null); void loginOpen(site).catch((e) => setError(String(e))) }} disabled={disabled}>
        {status?.connected ? `Me reconnecter à ${name}` : `Me connecter à ${name}`}
      </button>
      <span className="text-sm" style={{ color: status?.connected ? '#2b8a3e' : 'var(--fg-muted)' }}>{loginLabel(status)}</span>
      {error && <span className="text-xs" style={{ color: '#d44c47' }}>{error}</span>}
    </div>
  )
}

/** Le rythme du téléchargement automatique, et l'alerte « connexion à refaire » laissée par le dernier essai. */
function AutoDownloadOption() {
  const [frequency, setFrequency] = useState<AutoFrequency | null>(null)
  const [last, setLast] = useState('')
  const [alert, setAlertText] = useState('')
  useEffect(() => {
    void Promise.all([downloadFrequency(), getSetting(DOWNLOAD_LAST_DAY_KEY), getSetting(ALERT_KEY)]).then(([f, day, a]) => {
      setFrequency(f)
      setLast(day ?? '')
      setAlertText(a ?? '')
    })
  }, [])
  if (frequency === null) return null
  return (
    <div className="mt-5 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-side)' }}>
      <label className="flex flex-wrap items-center gap-2 font-medium">
        Télécharger mes nouveaux enregistrements automatiquement :
        <select className="lib-input" value={frequency} onChange={(e) => { const f = e.target.value as AutoFrequency; setFrequency(f); void setSetting(DOWNLOAD_FREQUENCY_KEY, f) }} aria-label="Fréquence du téléchargement automatique">
          {DOWNLOAD_FREQUENCIES.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </label>
      <p className="mt-1" style={{ color: 'var(--fg-muted)' }}>
        Quelques secondes après l'ouverture de Form, quand c'est le moment, avec les mêmes règles que le bouton ci-dessous (seulement les nouveautés). Il faut être connecté ci-dessus ; si la connexion a expiré, Form te le dit ici et saute ce site.
        Les pauses entre fichiers limitent le risque pour ton compte, mais Instagram n'aime pas les téléchargements automatiques : une fois par semaine est raisonnable.
        {frequency !== 'never' && (last ? ` Dernier téléchargement automatique : ${last.split('-').reverse().join('/')}.` : ' Aucun téléchargement automatique fait pour le moment.')}
      </p>
      {alert && <p className="mt-2" style={{ color: '#d9730d' }}>{alert}</p>}
    </div>
  )
}

/**
 * Télécharger mes enregistrements Instagram et mes épingles Pinterest (ce que faisait Form) : même méthode, mêmes dossiers, mêmes noms de fichiers,
 * mêmes pauses. Seules les nouveautés sont téléchargées ; la bibliothèque se met à jour toute seule ensuite.
 */
export function SaverSection() {
  const root = useLibrary((s) => s.root)
  const update = useLibrary((s) => s.update)
  const [s, setS] = useState<SaverSettings>(EMPTY_SAVER)
  const [loaded, setLoaded] = useState(false)
  const [running, setRunning] = useState(false)
  const [counts, setCounts] = useState({ new: 0, skipped: 0 })
  const [lines, setLines] = useState<Line[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadSaverSettings().then(({ settings }) => {
      setS(settings)
      setLoaded(true)
    })
  }, [])

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
      // De nouveaux fichiers sont arrivés : tout se fait tout seul ensuite (lecture du dossier, miniatures, vidéos, empreintes d'IA, couleurs, classement).
      // L'IA est branchée d'abord, pour qu'elle prenne le relais dès que les miniatures sont prêtes.
      if (d.new > 0 && !d.error) void useAi.getState().init(true).then(() => update())
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

  return (
    <div className="py-4">
      <h2 className="text-base font-semibold">Télécharger mes enregistrements</h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
        Form télécharge tes enregistrés Instagram et tes épingles Pinterest dans ton dossier « Bibliotheque » ({root || 'dossier non choisi'}), rangés dans « instagram » et « pinterest ».
        Seules les nouveautés sont téléchargées.
        Tu te connectes à chaque site <b>une seule fois</b> dans une petite fenêtre de Form : tu tapes ton mot de passe toi-même sur le site, Form ne le voit jamais.
        Il garde seulement la session et fait des pauses entre les fichiers pour ne pas gêner ton compte.
      </p>


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
            <LoginRow site="instagram" disabled={running || !s.doIg} onFile={(f) => { if (s.igCookies !== f) { change({ igCookies: f }); void adoptCookies('instagram', f) } }} />
          </div>

          <div className="mt-5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={s.doPin} onChange={(e) => change({ doPin: e.target.checked })} disabled={running} /> Pinterest : mes épingles et mes tableaux
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="w-28 shrink-0 text-sm" style={{ color: 'var(--fg-muted)' }}>Lien du profil</span>
              <input className={input} style={inputStyle} value={s.pinUrl} onChange={(e) => change({ pinUrl: e.target.value })} placeholder="https://www.pinterest.com/monpseudo/ (ou un seul tableau)" disabled={running || !s.doPin} aria-label="Lien du profil Pinterest" />
            </div>
            <LoginRow site="pinterest" disabled={running || !s.doPin} onFile={(f) => { if (s.pinCookies !== f) { change({ pinCookies: f }); void adoptCookies('pinterest', f) } }} />
          </div>

          <AutoDownloadOption />

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
