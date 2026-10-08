import { useEffect, useMemo, useState } from 'react'
import { todayISO } from '@/lib/backup'
import { centsToInput, formatEuros, parseEuros, UNITS } from '@/lib/business'
import {
  aiAvailable, askGemini, askGeminiVideo, DEFAULT_MODEL, keyExists, MODE_LABELS, parseLines, parseRecipe, parseTasks, videoLinkProblem,
  type AiLine, type AiMode, type AiPriority, type AiTask, type Recipe,
} from '@/lib/ai'
import { parseSchema } from '@/lib/database'
import { recipeCategories, recipesSchema, type RecipeCategory } from '@/lib/recipes'
import { newInvoiceLine, isInvoiceDraft } from '@/lib/invoices'
import { newLine, isDraft } from '@/lib/quotes'
import { detectSensitive, planSend, summarize } from '@/lib/sensitive'
import { extractText } from '@/lib/search'
import { useApp } from '@/store/app'

const field = 'w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]'
const primary = 'rounded bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-40'
const secondary = 'rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'

const HINTS: Record<AiMode, string> = {
  recipe: 'Colle une recette (page web, message, notes…). Gemini en fait une page propre : portions, ingrédients, étapes.',
  lines: "Colle un brief ou un e-mail de client. Gemini en tire des lignes de devis ou de facture (libellé, quantité, prix). Tu relis tout avant de l'ajouter.",
  tasks: 'Colle des notes en vrac (compte rendu de réunion, e-mail…). Gemini en tire une liste de tâches avec échéances.',
}

interface Props {
  initialMode?: AiMode
  /** Si fourni (depuis un devis ou une facture), on n'affiche que les lignes et on les renvoie à l'éditeur. */
  onApplyLines?: (lines: AiLine[]) => void
  onClose: () => void
}

export function AssistantModal({ initialMode = 'recipe', onApplyLines, onClose }: Props) {
  const store = useApp()
  const { repo, objects, quotes, quoteLines, invoices, invoiceLines, selectedId } = store
  const [mode, setMode] = useState<AiMode>(onApplyLines ? 'lines' : initialMode)
  const [text, setText] = useState('')
  const [videoLink, setVideoLink] = useState('')
  const [redact, setRedact] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [keyState, setKeyState] = useState<'unknown' | 'yes' | 'no'>('unknown')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [recipeCategory, setRecipeCategory] = useState('')
  const [lines, setLines] = useState<AiLine[] | null>(null)
  const [tasks, setTasks] = useState<(AiTask & { keep: boolean })[] | null>(null)
  const [targetKey, setTargetKey] = useState('')
  const [tasksDb, setTasksDb] = useState('')

  useEffect(() => {
    void keyExists().then((ok) => setKeyState(ok ? 'yes' : 'no'), () => setKeyState('no'))
    void repo?.getSetting('gemini_model').then((m) => m && setModel(m))
  }, [repo])

  const plan = useMemo(() => planSend(text, redact), [text, redact])
  const hasContacts = useMemo(() => detectSensitive(text).some((f) => f.kind !== 'amount'), [text])
  useEffect(() => setConfirmed(false), [text, redact, mode])

  const page = objects.find((o) => o.id === selectedId && o.type === 'page' && !o.deleted_at)
  const draftQuotes = quotes.filter((q) => isDraft(q))
  const draftInvoices = invoices.filter((i) => isInvoiceDraft(i) && i.kind !== 'credit')
  const recipesDb = objects.find((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'recipes')
  const tasksDbs = objects.filter((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'tasks')

  const hasResult = recipe !== null || lines !== null || tasks !== null
  const reset = () => { setRecipe(null); setLines(null); setTasks(null); setError(null) }

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const raw = await askGemini(mode, plan.text, model, todayISO())
      if (mode === 'recipe') setRecipe(parseRecipe(raw))
      else if (mode === 'lines') setLines(parseLines(raw))
      else setTasks(parseTasks(raw).map((t) => ({ ...t, keep: true })))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const sendVideo = async () => {
    const problem = videoLinkProblem(videoLink)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      setRecipe(parseRecipe(await askGeminiVideo(videoLink, model, todayISO())))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const applyLines = async () => {
    if (!lines) return
    if (onApplyLines) { onApplyLines(lines); onClose(); return }
    const [kind, id] = targetKey.split(':')
    if (kind === 'q') {
      const q = quotes.find((x) => x.id === id)
      if (!q) return
      const existing = quoteLines.filter((l) => l.quote_id === q.id).sort((a, b) => a.position - b.position)
      const added = lines.map((l, i) => ({ ...newLine(q.id, existing.length + i), label: l.label, description: l.description, quantity_milli: l.quantity_milli, unit: l.unit, unit_price_cents: l.unit_price_cents ?? 0 }))
      await store.saveQuoteDraft(q, [...existing, ...added])
      store.openQuote(q.id)
    } else if (kind === 'i') {
      const inv = invoices.find((x) => x.id === id)
      if (!inv) return
      const existing = invoiceLines.filter((l) => l.invoice_id === inv.id).sort((a, b) => a.position - b.position)
      const added = lines.map((l, i) => newInvoiceLine(inv.id, existing.length + i, { label: l.label, description: l.description, quantity_milli: l.quantity_milli, unit: l.unit, unit_price_cents: l.unit_price_cents ?? 0 }))
      await store.saveInvoiceDraft(inv, [...existing, ...added])
      store.openInvoice(inv.id)
    }
    onClose()
  }

  const keyProblem = !aiAvailable()
    ? "L'assistant IA n'est disponible que dans l'application Windows."
    : keyState === 'no'
      ? 'Aucune clé Gemini enregistrée. Ajoute-la dans Réglages > Assistant IA (c’est gratuit et ça prend 2 minutes).'
      : null
  const canSend = text.trim() !== '' && (!plan.needsConfirmation || confirmed) && keyState === 'yes' && !busy

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-[5vh]" onMouseDown={onClose}>
      <div className="w-[760px] max-w-[94vw] rounded-lg border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-xl font-bold">✨ Assistant</h2>
          <span className="text-xs text-[var(--fg-muted)]">Gemini · jamais automatique</span>
          <div className="flex-1" />
          <button className={secondary} onClick={onClose}>Fermer</button>
        </div>

        {!onApplyLines && (
          <div className="mb-3 flex gap-1 border-b border-[var(--border)]">
            {(Object.keys(MODE_LABELS) as AiMode[]).map((m) => (
              <button key={m} onClick={() => { setMode(m); reset() }} className={'border-b-2 px-3 py-1.5 text-sm ' + (mode === m ? 'border-[var(--fg)] font-medium' : 'border-transparent text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]')}>
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        )}

        {keyProblem && <div className="mb-3 rounded border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">{keyProblem}</div>}

        {!hasResult && (
          <>
            <p className="mb-2 text-sm text-[var(--fg-muted)]">{HINTS[mode]}</p>
            {mode === 'recipe' && (
              <div className="mb-4 rounded border border-[var(--border)] p-3">
                <div className="mb-1 text-sm font-medium">Depuis une vidéo YouTube</div>
                <p className="mb-2 text-xs text-[var(--fg-muted)]">
                  Colle le lien : Gemini regarde et écoute la vidéo, lit sa description, et écrit les ingrédients et les étapes. Seul le lien est envoyé à Google. Pour Instagram, TikTok ou Facebook (non lisibles), copie la légende dans la zone de texte plus bas.
                </p>
                <div className="flex gap-2">
                  <input className={field} value={videoLink} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => setVideoLink(e.target.value)} />
                  <button className={primary + ' shrink-0'} disabled={videoLink.trim() === '' || keyState !== 'yes' || busy} onClick={() => void sendVideo()}>{busy ? 'Analyse…' : 'Analyser la vidéo'}</button>
                </div>
              </div>
            )}
            <textarea className={field + ' h-44 text-sm'} value={text} placeholder="Colle ton texte ici…" onChange={(e) => setText(e.target.value)} autoFocus />
            {page && (
              <button className={secondary + ' mt-2'} onClick={() => setText(extractText(page.content))}>Utiliser le texte de la page « {page.title || 'Nouvelle page'} »</button>
            )}

            {text.trim() !== '' && (
              <div className="mt-3 rounded border border-[var(--border)] p-3 text-sm">
                <div className="mb-1 font-medium">Ce qui sera envoyé à Google</div>
                <p className="mb-2 text-xs text-[var(--fg-muted)]">
                  Uniquement le texte ci-dessous, rien d'autre (ni ta base, ni tes factures). Sur le palier gratuit, Google peut utiliser les textes envoyés pour améliorer ses services.
                </p>
                {hasContacts && (
                  <label className="mb-2 flex items-center gap-2">
                    <input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} />
                    Masquer automatiquement les e-mails, téléphones, IBAN et SIRET
                  </label>
                )}
                <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-[var(--bg-side)] p-2 text-xs">{plan.text}</pre>
                {plan.needsConfirmation && (
                  <div className="mt-2 rounded border border-yellow-500/50 bg-yellow-500/10 p-2">
                    <div className="text-xs">⚠ Ce texte contient encore : <strong>{summarize(plan.remaining)}</strong>.</div>
                    <label className="mt-1 flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                      Je confirme l'envoi de ces informations à Google
                    </label>
                  </div>
                )}
              </div>
            )}

            {error && <div className="mt-3 rounded border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-500">{error}</div>}
            <div className="mt-4 flex items-center gap-3">
              <button className={primary} disabled={!canSend} onClick={() => void send()}>{busy ? 'Gemini réfléchit…' : 'Envoyer à Gemini'}</button>
              <span className="text-xs text-[var(--fg-muted)]">Modèle : {model}</span>
            </div>
          </>
        )}

        {recipe && (
          <RecipeResult recipe={recipe} categories={recipeCategories(parseSchema(recipesDb?.properties ?? JSON.stringify(recipesSchema())))} category={recipeCategory} onCategory={setRecipeCategory} onChange={setRecipe} onBack={reset} onApply={async () => { await store.createRecipePage(recipe, recipeCategory || undefined); onClose() }} />
        )}

        {lines && (
          <div>
            <p className="mb-2 text-sm text-[var(--fg-muted)]">Vérifie et corrige les lignes. Un prix vide veut dire que Gemini ne l'a pas trouvé dans le texte : complète-le.</p>
            <div className="mb-1 flex gap-2 text-xs text-[var(--fg-muted)]"><div className="flex-1">Libellé</div><div className="w-16">Qté</div><div className="w-24">Unité</div><div className="w-28">Prix unit. HT (€)</div><div className="w-6" /></div>
            {lines.map((l, i) => (
              <LineEdit key={i} line={l} onChange={(nl) => setLines(lines.map((x, j) => (j === i ? nl : x)))} onRemove={() => setLines(lines.filter((_, j) => j !== i))} />
            ))}
            {!onApplyLines && (
              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-xs text-[var(--fg-muted)]">Ajouter à un brouillon</span>
                <select className={field} value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {draftQuotes.map((q) => <option key={q.id} value={`q:${q.id}`}>Devis brouillon : {q.title || 'sans objet'} ({q.issue_date})</option>)}
                  {draftInvoices.map((i) => <option key={i.id} value={`i:${i.id}`}>Facture brouillon : {i.title || 'sans objet'} ({i.issue_date})</option>)}
                </select>
                {draftQuotes.length + draftInvoices.length === 0 && <span className="mt-1 block text-xs text-[var(--fg-muted)]">Aucun brouillon : crée un devis ou une facture, puis utilise le bouton « ✨ Lignes depuis un texte » dedans.</span>}
              </label>
            )}
            <div className="mt-4 flex gap-2">
              <button className={primary} disabled={lines.length === 0 || (!onApplyLines && !targetKey)} onClick={() => void applyLines()}>{onApplyLines ? 'Ajouter ces lignes' : 'Ajouter au brouillon'}</button>
              <button className={secondary} onClick={reset}>Recommencer</button>
            </div>
          </div>
        )}

        {tasks && (
          <div>
            <p className="mb-2 text-sm text-[var(--fg-muted)]">Décoche les tâches à ignorer, corrige les titres et les dates.</p>
            {tasks.map((t, i) => (
              <div key={i} className="mb-1 flex items-center gap-2">
                <input type="checkbox" checked={t.keep} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />
                <input className={field + ' flex-1'} value={t.title} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <input type="date" className={field + ' w-40'} value={t.due ?? ''} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, due: e.target.value || null } : x)))} />
                <select className={field + ' w-32'} value={t.priority ?? ''} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, priority: (e.target.value || null) as AiPriority | null } : x)))}>
                  <option value="">Priorité —</option><option value="haute">Haute</option><option value="moyenne">Moyenne</option><option value="basse">Basse</option>
                </select>
              </div>
            ))}
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs text-[var(--fg-muted)]">Ajouter à</span>
              <select className={field} value={tasksDb} onChange={(e) => setTasksDb(e.target.value)}>
                <option value="">Une nouvelle base « Tâches »</option>
                {tasksDbs.map((d) => <option key={d.id} value={d.id}>{d.title || 'Tâches'}</option>)}
              </select>
            </label>
            <div className="mt-4 flex gap-2">
              <button className={primary} disabled={!tasks.some((t) => t.keep && t.title.trim())} onClick={async () => { await store.addTasksFromAi(tasks.filter((t) => t.keep && t.title.trim()), tasksDb || null); onClose() }}>Ajouter les tâches</button>
              <button className={secondary} onClick={reset}>Recommencer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LineEdit({ line, onChange, onRemove }: { line: AiLine; onChange: (l: AiLine) => void; onRemove: () => void }) {
  const [qty, setQty] = useState(String(line.quantity_milli / 1000).replace('.', ','))
  const [price, setPrice] = useState(line.unit_price_cents === null ? '' : centsToInput(line.unit_price_cents))
  return (
    <div className="mb-2 rounded border border-[var(--border)] p-2">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <input className={field} value={line.label} onChange={(e) => onChange({ ...line, label: e.target.value })} />
          <input className={field + ' mt-1 text-xs'} placeholder="Détails" value={line.description} onChange={(e) => onChange({ ...line, description: e.target.value })} />
        </div>
        <input className={field + ' w-16'} value={qty} onChange={(e) => setQty(e.target.value)} onBlur={() => { const n = Number(qty.replace(',', '.')); if (n > 0) onChange({ ...line, quantity_milli: Math.round(n * 1000) }); else setQty(String(line.quantity_milli / 1000).replace('.', ',')) }} />
        <select className={field + ' w-24'} value={line.unit} onChange={(e) => onChange({ ...line, unit: e.target.value })}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        <input className={field + ' w-28 text-right' + (line.unit_price_cents === null ? ' border-yellow-500' : '')} value={price} placeholder="à compléter" onChange={(e) => setPrice(e.target.value)} onBlur={() => onChange({ ...line, unit_price_cents: price.trim() === '' ? null : parseEuros(price) })} />
        <button title="Retirer cette ligne" className="w-6 text-red-500" onClick={onRemove}>×</button>
      </div>
      {line.unit_price_cents !== null && <div className="mt-1 text-right text-xs text-[var(--fg-muted)]">{formatEuros(Math.floor((line.unit_price_cents * line.quantity_milli + 500) / 1000))}</div>}
    </div>
  )
}

function RecipeResult({ recipe, categories, category, onCategory, onChange, onBack, onApply }: { recipe: Recipe; categories: RecipeCategory[]; category: string; onCategory: (id: string) => void; onChange: (r: Recipe) => void; onBack: () => void; onApply: () => void }) {
  const list = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean)
  return (
    <div>
      <p className="mb-2 text-sm text-[var(--fg-muted)]">Relis la recette : une ligne par ingrédient, une ligne par étape.</p>
      <div className="grid grid-cols-3 gap-3">
        <label className="col-span-2 block text-xs text-[var(--fg-muted)]">Titre<input className={field + ' mt-1'} value={recipe.title} onChange={(e) => onChange({ ...recipe, title: e.target.value })} /></label>
        <label className="block text-xs text-[var(--fg-muted)]">Portions<input className={field + ' mt-1'} value={recipe.servings} onChange={(e) => onChange({ ...recipe, servings: e.target.value })} /></label>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <label className="block text-xs text-[var(--fg-muted)]">Ingrédients<textarea className={field + ' mt-1 h-44 text-sm'} defaultValue={recipe.ingredients.join('\n')} onBlur={(e) => onChange({ ...recipe, ingredients: list(e.target.value) })} /></label>
        <label className="block text-xs text-[var(--fg-muted)]">Étapes<textarea className={field + ' mt-1 h-44 text-sm'} defaultValue={recipe.steps.join('\n')} onBlur={(e) => onChange({ ...recipe, steps: list(e.target.value) })} /></label>
      </div>
      <label className="mt-3 block text-xs text-[var(--fg-muted)]">Catégorie
        <select className={field + ' mt-1'} value={category} onChange={(e) => onCategory(e.target.value)}>
          <option value="">Sans catégorie</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
      </label>
      <div className="mt-4 flex gap-2">
        <button className={primary} onClick={onApply}>Créer la page de recette</button>
        <button className={secondary} onClick={onBack}>Recommencer</button>
      </div>
    </div>
  )
}
