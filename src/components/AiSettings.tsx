import { useEffect, useState } from 'react'
import { todayISO } from '@/lib/backup'
import { aiAvailable, askGemini, DEFAULT_MODEL, deleteKey, keyExists, listModels, parseTasks, saveKey } from '@/lib/ai'
import { isTauri } from '@/lib/repo'
import { useApp } from '@/store/app'

const field = 'w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]'
const primary = 'rounded bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-40'
const secondary = 'rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'

export function AiSettings() {
  const repo = useApp((s) => s.repo)
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [key, setKey] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [models, setModels] = useState<string[]>([])
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const available = aiAvailable()

  useEffect(() => {
    void keyExists().then(setHasKey, () => setHasKey(false))
    void repo?.getSetting('gemini_model').then((m) => m && setModel(m))
  }, [repo])

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

  const save = () => run(async () => {
    await saveKey(key)
    setKey('')
    setHasKey(true)
    return 'Clé enregistrée dans le coffre de Windows. Elle ne s’affichera plus jamais ici.'
  })
  const remove = () => run(async () => {
    if (!window.confirm('Supprimer la clé Gemini de ce PC ?')) return
    await deleteKey()
    setHasKey(false)
    return 'Clé supprimée.'
  })
  const loadModels = () => run(async () => {
    const list = await listModels()
    setModels(list)
    return `${list.length} modèles disponibles.`
  })
  const chooseModel = async (m: string) => {
    setModel(m)
    await repo?.setSetting('gemini_model', m)
  }
  const test = () => run(async () => {
    const raw = await askGemini('tasks', 'Appeler Marie demain pour valider le logo.', model, todayISO())
    const tasks = parseTasks(raw)
    return `Ça marche : Gemini a compris « ${tasks[0].title} »${tasks[0].due ? ` pour le ${tasks[0].due}` : ''}.`
  })

  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <h1 className="mb-1 text-3xl font-bold">Assistant IA (Gemini)</h1>
      <p className="mb-5 text-sm text-[var(--fg-muted)]">
        Un bouton « ✨ Assistant » transforme un texte que tu colles en recette, en lignes de facture ou en liste de tâches. Il ne fait rien tout seul.
      </p>

      {!available && <div className="mb-4 rounded border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">L'assistant n'est disponible que dans l'application Windows.</div>}

      <h2 className="mb-2 text-lg font-semibold">Clé d'accès</h2>
      <p className="mb-2 text-sm">
        État : {hasKey === null ? '…' : hasKey ? <strong className="text-green-600">clé enregistrée ✓</strong> : <strong>aucune clé</strong>}
      </p>
      <ol className="mb-3 ml-5 list-decimal text-sm text-[var(--fg-muted)]">
        <li>Va sur <strong>aistudio.google.com/apikey</strong> et connecte-toi avec ton compte Google.</li>
        <li>Clique sur <strong>« Create API key »</strong> (c'est gratuit, aucune carte bancaire).</li>
        <li>Copie la clé et colle-la ci-dessous.</li>
      </ol>
      <div className="mb-2 flex gap-2">
        <input className={field} type="password" autoComplete="off" placeholder="Colle ta clé ici" value={key} onChange={(e) => setKey(e.target.value)} disabled={!isTauri()} />
        <button className={primary} disabled={!isTauri() || key.trim().length < 20 || busy} onClick={() => void save()}>Enregistrer</button>
        {hasKey && <button className={secondary} disabled={busy} onClick={() => void remove()}>Supprimer</button>}
      </div>
      <p className="mb-6 text-xs text-[var(--fg-muted)]">
        La clé est rangée dans le <strong>coffre de Windows</strong> (Gestionnaire d'identification). Elle n'est écrite ni dans la base de Form ni dans tes sauvegardes, et l'interface ne peut plus la relire.
      </p>

      <h2 className="mb-2 text-lg font-semibold">Modèle</h2>
      <div className="mb-2 flex gap-2">
        <input className={field} value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => void chooseModel(model.trim() || DEFAULT_MODEL)} />
        <button className={secondary} disabled={!isTauri() || !hasKey || busy} onClick={() => void loadModels()}>Voir la liste</button>
      </div>
      {models.length > 0 && (
        <select className={field + ' mb-2'} value={model} onChange={(e) => void chooseModel(e.target.value)}>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      )}
      <p className="mb-4 text-xs text-[var(--fg-muted)]">Les modèles « flash » sont rapides et couverts par le palier gratuit. Si Google en retire un, choisis-en un autre dans la liste.</p>
      <button className={secondary} disabled={!isTauri() || !hasKey || busy} onClick={() => void test()}>{busy ? 'Test en cours…' : 'Tester la connexion'}</button>
      {message && <p className={'mt-3 text-sm ' + (message.ok ? 'text-green-600' : 'text-red-500')}>{message.text}</p>}

      <h2 className="mb-2 mt-8 text-lg font-semibold">Ta confidentialité</h2>
      <ul className="ml-5 list-disc text-sm text-[var(--fg-muted)]">
        <li><strong>Jamais automatique</strong> : rien ne part tant que tu n'as pas cliqué sur « Envoyer à Gemini ».</li>
        <li>Seul le <strong>texte que tu colles</strong> est envoyé, jamais ta base, tes clients ou tes factures.</li>
        <li>Avant l'envoi, tu vois le texte exact. Les <strong>e-mails, téléphones, IBAN et SIRET</strong> sont masqués par défaut, et les <strong>montants</strong> demandent ta confirmation.</li>
        <li>Sur le palier gratuit, Google peut utiliser les textes envoyés pour améliorer ses services : n'envoie rien de confidentiel.</li>
      </ul>
    </div>
  )
}
