import { useEffect, useState } from 'react'
import {
  configProblems, defaultMailConfig, deleteMailPassword, fetchMail, loadMailConfig, mailAvailable, mailPasswordSaved, PRESETS,
  saveMailConfig, saveMailPassword, splitList, testMail, type MailConfig, type MailItem,
} from '@/lib/mail'
import { formatDateFr } from '@/lib/quotes'
import { isTauri } from '@/lib/repo'
import { useApp } from '@/store/app'

const field = 'w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]'
const primary = 'rounded bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-40'
const secondary = 'rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-[var(--fg-muted)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--fg-muted)]">{hint}</span>}
    </label>
  )
}

export function MailSettings() {
  const { repo, syncMail } = useApp()
  const [config, setConfig] = useState<MailConfig>(defaultMailConfig())
  const [senders, setSenders] = useState('')
  const [subjects, setSubjects] = useState('')
  const [password, setPassword] = useState('')
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [latest, setLatest] = useState<MailItem[] | null>(null)
  const available = mailAvailable()

  useEffect(() => {
    if (!repo) return
    void loadMailConfig(repo).then((c) => { setConfig(c); setSenders(c.senders.join(', ')); setSubjects(c.subjects.join(', ')) })
    void mailPasswordSaved().then(setHasPassword, () => setHasPassword(false))
  }, [repo])

  const current = (): MailConfig => ({ ...config, senders: splitList(senders), subjects: splitList(subjects) })
  const problems = configProblems(current())

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setMessage(null)
    try {
      const text = await fn()
      if (text) setMessage({ text, ok: true })
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setBusy(false)
    }
  }

  const saveConfig = () => run(async () => {
    if (!repo) return
    await saveMailConfig(repo, current())
    return 'Réglages enregistrés.'
  })
  const savePassword = () => run(async () => {
    await saveMailPassword(password)
    setPassword('')
    setHasPassword(true)
    return 'Mot de passe enregistré dans le coffre de Windows. Il ne s’affichera plus jamais ici.'
  })
  const removePassword = () => run(async () => {
    if (!window.confirm('Supprimer le mot de passe de ce PC ?')) return
    await deleteMailPassword()
    setHasPassword(false)
    return 'Mot de passe supprimé.'
  })
  const test = () => run(async () => {
    if (repo) await saveMailConfig(repo, current())
    const text = await testMail(current())
    setLatest(await fetchMail(current(), false, 30))
    return text
  })
  const syncNow = () => run(async () => {
    if (repo) await saveMailConfig(repo, current())
    const n = await syncMail()
    return n === 0 ? 'Aucun nouveau courrier.' : `${n} nouveau${n > 1 ? 'x' : ''} courrier${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} à la base « Courrier ».`
  })

  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <h1 className="mb-1 text-3xl font-bold">Courrier (SeDomicilier)</h1>
      <p className="mb-5 text-sm text-[var(--fg-muted)]">
        Form lit ta boîte mail pour repérer les e-mails de ton service de domiciliation (courrier scanné) et les range dans une base « Courrier ».
        La lecture est <strong>en lecture seule</strong> : Form ne marque rien comme lu, ne déplace ni ne supprime aucun e-mail, et n'en envoie jamais.
      </p>

      {!available && <div className="mb-4 rounded border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">Le courrier n'est disponible que dans l'application Windows.</div>}

      <h2 className="mb-2 text-lg font-semibold">Ta messagerie</h2>
      <div className="grid grid-cols-2 gap-x-4">
        <Row label="Fournisseur">
          <select className={field} value={config.provider} onChange={(e) => { const p = e.target.value as MailConfig['provider']; setConfig({ ...config, provider: p, host: PRESETS[p].host || config.host }) }}>
            {(Object.keys(PRESETS) as MailConfig['provider'][]).map((p) => <option key={p} value={p}>{PRESETS[p].label}</option>)}
          </select>
        </Row>
        <Row label="Serveur IMAP"><input className={field} value={config.host} onChange={(e) => setConfig({ ...config, host: e.target.value.trim() })} /></Row>
        <Row label="Adresse e-mail"><input className={field} value={config.user} placeholder="toi@gmail.com" onChange={(e) => setConfig({ ...config, user: e.target.value })} /></Row>
        <Row label="Dossier à lire" hint="« INBOX » = boîte de réception."><input className={field} value={config.folder} onChange={(e) => setConfig({ ...config, folder: e.target.value })} /></Row>
      </div>

      <h2 className="mb-2 mt-3 text-lg font-semibold">Mot de passe</h2>
      <p className="mb-2 text-sm">
        État : {hasPassword === null ? '…' : hasPassword ? <strong className="text-green-600">enregistré ✓</strong> : <strong>aucun</strong>}
      </p>
      <div className="mb-2 rounded border border-[var(--border)] p-3 text-xs text-[var(--fg-muted)]">
        <strong className="text-[var(--fg)]">Avec Gmail</strong>, ton mot de passe habituel ne fonctionne pas : il faut un « mot de passe d'application ».
        <ol className="ml-5 mt-1 list-decimal">
          <li>Dans ton compte Google, active la <strong>validation en deux étapes</strong> (si ce n'est pas fait).</li>
          <li>Va sur <strong>myaccount.google.com/apppasswords</strong>, crée un mot de passe d'application nommé « Form » et copie les 16 lettres.</li>
          <li>Dans Gmail &gt; Paramètres &gt; Transfert et POP/IMAP, vérifie que <strong>l'accès IMAP est activé</strong>.</li>
        </ol>
      </div>
      <div className="mb-2 flex gap-2">
        <input className={field} type="password" autoComplete="off" placeholder="Colle le mot de passe d'application" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!isTauri()} />
        <button className={primary} disabled={!isTauri() || password.trim().length < 6 || busy} onClick={() => void savePassword()}>Enregistrer</button>
        {hasPassword && <button className={secondary} disabled={busy} onClick={() => void removePassword()}>Supprimer</button>}
      </div>
      <p className="mb-5 text-xs text-[var(--fg-muted)]">Le mot de passe est rangé dans le <strong>coffre de Windows</strong>, pas dans la base de Form ni dans tes sauvegardes.</p>

      <h2 className="mb-2 text-lg font-semibold">Quels e-mails reconnaître ?</h2>
      <Row label="Expéditeurs" hint="Un e-mail est reconnu si son expéditeur contient un de ces mots (séparés par des virgules). Par défaut : sedomicilier.">
        <input className={field} value={senders} onChange={(e) => setSenders(e.target.value)} />
      </Row>
      <Row label="Mots de l'objet (facultatif)" hint="Reconnaît aussi les e-mails dont l'objet contient un de ces mots.">
        <input className={field} value={subjects} onChange={(e) => setSubjects(e.target.value)} />
      </Row>
      <div className="grid grid-cols-2 gap-x-4">
        <Row label="Messages récents examinés"><input className={field} type="number" min={20} max={2000} value={config.scanLast} onChange={(e) => setConfig({ ...config, scanLast: Math.min(2000, Math.max(20, Number(e.target.value) || 200)) })} /></Row>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input type="checkbox" checked={config.auto} onChange={(e) => setConfig({ ...config, auto: e.target.checked })} />
          Relever automatiquement (au démarrage, puis toutes les 30 min)
        </label>
      </div>

      {problems.length > 0 && <ul className="mb-3 ml-5 list-disc text-xs text-[var(--fg-muted)]">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={busy} onClick={() => void saveConfig()}>Enregistrer les réglages</button>
        <button className={secondary} disabled={busy || problems.length > 0 || !hasPassword} onClick={() => void test()}>{busy ? 'En cours…' : 'Tester et voir les derniers e-mails'}</button>
        <button className={secondary} disabled={busy || problems.length > 0 || !hasPassword} onClick={() => void syncNow()}>Relever le courrier maintenant</button>
      </div>
      {message && <p className={'mt-3 text-sm ' + (message.ok ? 'text-green-600' : 'text-red-500')}>{message.text}</p>}

      {latest && (
        <div className="mt-6">
          <h2 className="mb-1 text-lg font-semibold">Derniers e-mails vus</h2>
          <p className="mb-2 text-xs text-[var(--fg-muted)]">Les lignes marquées ✓ seraient classées dans « Courrier ». Si un e-mail de SeDomicilier n'est pas marqué, ajoute un mot de son expéditeur ou de son objet ci-dessus.</p>
          <table className="w-full text-xs">
            <tbody>
              {latest.map((m) => (
                <tr key={m.message_id + m.uid} className="border-b border-[var(--border)]">
                  <td className="w-6 py-1 text-green-600">{m.matched ? '✓' : ''}</td>
                  <td className="w-24 pr-2">{formatDateFr(m.date)}</td>
                  <td className="max-w-[200px] truncate pr-2">{m.from}</td>
                  <td className="truncate">{m.subject}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {latest.length === 0 && <p className="text-sm text-[var(--fg-muted)]">Aucun message dans ce dossier.</p>}
        </div>
      )}
    </div>
  )
}
