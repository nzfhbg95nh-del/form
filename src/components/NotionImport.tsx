import { useState } from 'react'
import { analyze, readZip, runImport, type ImportResult } from '@/lib/notionImport'
import type { NotionFile, Plan } from '@/lib/notion'
import { useApp } from '@/store/app'

const primary = 'rounded bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-40'
const secondary = 'rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'

export function NotionImport() {
  const { repo, objects, reloadObjects } = useApp()
  const [files, setFiles] = useState<NotionFile[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [withImages, setWithImages] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pick = async (file: File) => {
    setBusy(true)
    setError(null)
    setResult(null)
    setPlan(null)
    try {
      const all = readZip(new Uint8Array(await file.arrayBuffer()))
      const p = analyze(all)
      if (p.nodes.length === 0) throw new Error("Aucune page trouvée dans ce fichier. Vérifie que c'est bien un export Notion au format « Markdown & CSV ».")
      setFiles(all)
      setFileName(file.name)
      setPlan(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const start = async () => {
    if (!repo || !files || !plan) return
    setBusy(true)
    setError(null)
    try {
      const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      const r = await runImport(files, plan, repo, objects, { withImages, rootTitle: `Import Notion du ${date}` }, (done, total, label) => setProgress({ done, total, label }))
      await reloadObjects()
      setResult(r)
      setPlan(null)
      setFiles(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const titleOf = (key: string | null) => plan?.nodes.find((n) => n.key === key)
  const depth = (key: string | null, d = 0): number => (key && d < 8 ? depth(titleOf(key)?.parentKey ?? null, d + 1) + (titleOf(key) ? 1 : 0) : 0)

  return (
    <div className="mx-auto max-w-3xl px-12 py-10">
      <h1 className="mb-1 text-3xl font-bold">Import depuis Notion</h1>
      <p className="mb-5 text-sm text-[var(--fg-muted)]">
        Récupère tes pages et tes bases Notion dans Form. L'import <strong>ajoute</strong> des pages : il ne modifie ni ne supprime rien de ce que tu as déjà. Tout arrive dans une page « Import Notion », que tu peux ensuite déplacer.
      </p>

      <h2 className="mb-2 text-lg font-semibold">1. Exporter depuis Notion</h2>
      <ol className="mb-4 ml-5 list-decimal text-sm text-[var(--fg-muted)]">
        <li>Dans Notion, ouvre la page à exporter (ou, pour tout récupérer : <strong>Paramètres &gt; Général &gt; Exporter tout le contenu de l'espace de travail</strong>).</li>
        <li>Pour une page : menu <strong>« ⋯ » &gt; Exporter</strong>.</li>
        <li>Choisis le format <strong>« Markdown &amp; CSV »</strong>, contenu <strong>« Tout »</strong>, et active <strong>« Inclure les sous-pages »</strong> et <strong>« Créer des dossiers pour les sous-pages »</strong>.</li>
        <li>Clique sur <strong>Exporter</strong> : Notion te donne un fichier <strong>.zip</strong> (par e-mail pour un grand espace).</li>
      </ol>

      <h2 className="mb-2 text-lg font-semibold">2. Choisir le fichier</h2>
      <input type="file" accept=".zip" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = '' }} className="mb-3 block text-sm" />
      {busy && !progress && <p className="text-sm text-[var(--fg-muted)]">Lecture du fichier…</p>}
      {error && <div className="mb-3 rounded border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-500">{error}</div>}

      {plan && (
        <>
          <h2 className="mb-2 mt-4 text-lg font-semibold">3. Vérifier et importer</h2>
          <p className="mb-2 text-sm">
            <strong>{fileName}</strong> contient <strong>{plan.stats.pages}</strong> page{plan.stats.pages > 1 ? 's' : ''},{' '}
            <strong>{plan.stats.databases}</strong> base{plan.stats.databases > 1 ? 's' : ''} de données ({plan.stats.rows} ligne{plan.stats.rows > 1 ? 's' : ''}) et <strong>{plan.stats.images}</strong> image{plan.stats.images > 1 ? 's' : ''}.
          </p>
          <ul className="mb-3 ml-5 list-disc text-xs text-[var(--fg-muted)]">{plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          <div className="mb-3 max-h-56 overflow-y-auto rounded border border-[var(--border)] p-2 text-sm">
            {plan.nodes.filter((n) => n.kind !== 'row').slice(0, 120).map((n) => (
              <div key={n.key} style={{ paddingLeft: Math.max(0, depth(n.key) - 1) * 14 }}>
                {n.kind === 'database' ? '▦' : '📄'} {n.title}
                {n.kind === 'database' && <span className="text-xs text-[var(--fg-muted)]"> · {plan.nodes.filter((r) => r.parentKey === n.key && r.kind === 'row').length} lignes</span>}
              </div>
            ))}
            {plan.nodes.filter((n) => n.kind !== 'row').length > 120 && <div className="text-xs text-[var(--fg-muted)]">… et d'autres pages</div>}
          </div>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} />
            Importer les images (elles sont réduites automatiquement ; décoche pour aller plus vite)
          </label>
          <div className="flex gap-2">
            <button className={primary} disabled={busy} onClick={() => void start()}>{busy ? 'Import en cours…' : 'Importer dans Form'}</button>
            <button className={secondary} disabled={busy} onClick={() => { setPlan(null); setFiles(null) }}>Annuler</button>
          </div>
        </>
      )}

      {progress && (
        <div className="mt-4">
          <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-hover)]">
            <div className="h-full bg-[var(--accent)]" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          <p className="truncate text-xs text-[var(--fg-muted)]">{progress.done} / {progress.total} — {progress.label}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded border border-green-600/40 bg-green-600/10 p-3 text-sm">
          <strong>Import terminé.</strong> {result.created} élément{result.created > 1 ? 's' : ''} créé{result.created > 1 ? 's' : ''}
          {result.skipped > 0 && `, ${result.skipped} déjà présent${result.skipped > 1 ? 's' : ''} (ignoré${result.skipped > 1 ? 's' : ''})`}, {result.images} image{result.images > 1 ? 's' : ''}.
          Cherche la page « Import Notion » dans ta barre latérale.
          {result.errors.length > 0 && (
            <details className="mt-2 text-xs text-[var(--fg-muted)]"><summary>{result.errors.length} avertissement{result.errors.length > 1 ? 's' : ''}</summary><ul className="ml-5 list-disc">{result.errors.slice(0, 30).map((e) => <li key={e}>{e}</li>)}</ul></details>
          )}
        </div>
      )}
    </div>
  )
}
