import { Fragment, useEffect, useMemo, useState } from 'react'
import { parseSchema, parseValues } from '@/lib/database'
import { configProblems, loadMailConfig, MAIL } from '@/lib/mail'
import { normalize } from '@/lib/search'
import { formatDateFr } from '@/lib/quotes'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

const field = 'rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]'
const secondary = 'rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'

/** Le courrier de la domiciliation : une vue à part (comme Clients ou Prestations), pas une page. */
export function MailView() {
  const { objects, repo, syncMail, setCell, select, show } = useApp()
  const [filter, setFilter] = useState<'todo' | 'all'>('todo')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [configured, setConfigured] = useState(true)

  useEffect(() => {
    if (repo) void loadMailConfig(repo).then((c) => setConfigured(configProblems(c).length === 0))
  }, [repo])

  const db = objects.find((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'mail')
  const rows = useMemo(() => {
    const q = normalize(query).trim()
    return objects
      .filter((o) => db && o.type === 'row' && o.parent_id === db.id && !o.deleted_at)
      .map((o) => ({ row: o, v: parseValues(o.properties) }))
      .filter(({ v }) => filter === 'all' || v[MAIL.status] !== 'traite')
      .filter(({ row, v }) => q === '' || normalize(`${row.title} ${v[MAIL.from] ?? ''} ${v[MAIL.preview] ?? ''}`).includes(q))
      .sort((a, b) => String(b.v[MAIL.date] ?? '').localeCompare(String(a.v[MAIL.date] ?? '')))
  }, [objects, db, filter, query])
  const todoCount = objects.filter((o) => db && o.type === 'row' && o.parent_id === db.id && !o.deleted_at && parseValues(o.properties)[MAIL.status] !== 'traite').length

  const sync = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const n = await syncMail()
      setMessage(n === 0 ? 'Aucun nouveau courrier.' : `${n} nouveau${n > 1 ? 'x' : ''} courrier${n > 1 ? 's' : ''} !`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-12 py-10">
      <h1 className="mb-1 text-3xl font-bold">Courrier</h1>
      <p className="mb-4 text-sm text-[var(--fg-muted)]">Les courriers scannés de ta domiciliation, repérés dans ta boîte mail (lecture seule).</p>

      {!configured && (
        <div className="mb-4 rounded border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
          La messagerie n'est pas encore configurée. <button className="text-[var(--accent)] hover:underline" onClick={() => show('settings')}>Ouvrir les réglages (onglet Courrier)</button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className={secondary} onClick={() => void sync()} disabled={busy}>📬 {busy ? 'Relève en cours…' : 'Relever le courrier'}</button>
        <select className={field} value={filter} onChange={(e) => setFilter(e.target.value as 'todo' | 'all')}>
          <option value="todo">À traiter ({todoCount})</option>
          <option value="all">Tout le courrier</option>
        </select>
        <input className={field + ' w-64'} placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {message && <span className="text-sm text-[var(--fg-muted)]">{message}</span>}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--fg-muted)]">
            <th className="w-24 py-2 pr-3 font-semibold">Date</th>
            <th className="pr-3 font-semibold">Expéditeur</th>
            <th className="pr-3 font-semibold">Objet</th>
            <th className="pr-3 font-semibold">Pièces jointes</th>
            <th className="w-28 font-semibold">Statut</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, v }) => {
            const done = v[MAIL.status] === 'traite'
            const expanded = open === row.id
            return (
              <Fragment key={row.id}>
                <tr onClick={() => setOpen(expanded ? null : row.id)} className={cn('cursor-pointer border-b border-[var(--border)] hover:bg-[var(--bg-hover)]', done && 'opacity-60')}>
                  <td className="py-2 pr-3 align-top">{formatDateFr(String(v[MAIL.date] ?? ''))}</td>
                  <td className="max-w-[200px] truncate pr-3 align-top">{String(v[MAIL.from] ?? '')}</td>
                  <td className="pr-3 align-top font-medium">{row.title}</td>
                  <td className="max-w-[200px] truncate pr-3 align-top text-[var(--fg-muted)]">{String(v[MAIL.files] ?? '')}</td>
                  <td className="align-top" onClick={(e) => e.stopPropagation()}>
                    <button
                      title="Cliquer pour changer le statut"
                      onClick={() => void setCell(row.id, MAIL.status, done ? 'atraiter' : 'traite')}
                      className="rounded px-2 py-0.5 text-xs"
                      style={{ background: done ? '#dbeddb' : '#fadec9', color: '#37352f' }}
                    >
                      {done ? 'Traité' : 'À traiter'}
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-side)]">
                    <td colSpan={5} className="px-3 py-3">
                      <p className="mb-2 whitespace-pre-wrap text-sm text-[var(--fg-muted)]">{String(v[MAIL.preview] ?? '') || 'Pas d’aperçu du texte.'}</p>
                      <button className={secondary} onClick={() => select(row.id)}>Ouvrir comme page (notes)</button>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="py-4 text-sm text-[var(--fg-muted)]">
          {db ? (filter === 'todo' ? 'Aucun courrier à traiter.' : 'Aucun courrier.') : 'Aucun courrier pour le moment : clique sur « Relever le courrier ».'}
        </p>
      )}
    </div>
  )
}
