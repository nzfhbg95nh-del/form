import { useEffect, useMemo, useRef, useState } from 'react'
import { AssistantModal } from '@/components/AssistantModal'
import { ArrowLeft, Plus } from 'lucide-react'
import { clientDisplayName, formatEuros } from '@/lib/business'
import { vatMention } from '@/lib/company'
import {
  blockersToIssue, creditedSoFarCents, DISPLAY_COLORS, DISPLAY_LABELS, displayStatus, invoiceTotalCents, invoiceWarnings,
  isInvoiceDraft, KIND_LABELS, newInvoiceLine, parseInvoiceSnapshot, type DisplayStatus,
} from '@/lib/invoices'
import type { InvoicePdfData } from '@/lib/pdf/invoicePdf'
import { savePdf } from '@/lib/pdf/savePdf'
import { addDays, formatDateFr, lineTotalCents } from '@/lib/quotes'
import { todayISO } from '@/lib/backup'
import { isFullyCredited, remainingCents } from '@/lib/payments'
import { InvoicePayments } from '@/components/PaymentParts'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { LineRow } from '@/components/QuotesView'
import type { AuditEntry, Invoice, InvoiceKind, InvoiceLine } from '@/lib/types'

const field = 'w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-70'
const primary = 'rounded bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-40'
const secondary = 'rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'

function Chip({ label, color }: { label: string; color: string }) {
  return <span className="rounded px-2 py-0.5 text-xs" style={{ background: color, color: '#37352f' }}>{label}</span>
}

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('mb-3 block', className)}>
      <span className="mb-1 block text-xs font-medium text-[var(--fg-muted)]">{label}</span>
      {children}
    </label>
  )
}

// ───────────────────────── Liste ─────────────────────────

export function InvoicesView() {
  const { invoices, invoiceLines, clients, openInvoiceId, openInvoice, createStandardInvoice } = useApp()
  const [status, setStatus] = useState<'all' | DisplayStatus>('all')
  const [kind, setKind] = useState<'all' | InvoiceKind>('all')
  if (openInvoiceId) return <InvoiceEditor key={openInvoiceId} id={openInvoiceId} onBack={() => openInvoice(null)} />

  const today = todayISO()
  const st = (i: Invoice) => displayStatus(i, today, isFullyCredited(i, invoices, invoiceLines))
  const shown = invoices.filter((i) => (status === 'all' || st(i) === status) && (kind === 'all' || i.kind === kind))
  return (
    <div className="mx-auto max-w-5xl px-12 py-10">
      <h1 className="mb-4 text-3xl font-bold">Factures</h1>
      <div className="mb-3 flex items-center gap-3">
        <select className={field + ' max-w-[190px]'} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="all">Tous les types</option>
          {(Object.keys(KIND_LABELS) as InvoiceKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </select>
        <select className={field + ' max-w-[190px]'} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">Tous les statuts</option>
          {(Object.keys(DISPLAY_LABELS) as DisplayStatus[]).map((s) => <option key={s} value={s}>{DISPLAY_LABELS[s]}</option>)}
        </select>
        <div className="flex-1" />
        <button className={primary + ' flex items-center gap-1'} onClick={() => void createStandardInvoice()}><Plus size={14} /> Nouvelle facture</button>
      </div>
      <p className="mb-3 text-xs text-[var(--fg-muted)]">Les factures d'acompte et de solde se créent depuis un devis accepté (section Devis).</p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--fg-muted)]">
            <th className="py-2 pr-3 font-semibold">Numéro</th>
            <th className="pr-3 font-semibold">Type</th>
            <th className="pr-3 font-semibold">Client</th>
            <th className="pr-3 font-semibold">Date</th>
            <th className="pr-3 font-semibold">Échéance</th>
            <th className="pr-3 text-right font-semibold">Total</th>
            <th className="pl-3 font-semibold">Statut</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((i) => {
            const client = clients.find((c) => c.id === i.client_id)
            const total = invoiceTotalCents(invoiceLines.filter((l) => l.invoice_id === i.id))
            const status = st(i)
            return (
              <tr key={i.id} onClick={() => openInvoice(i.id)} className="cursor-pointer border-b border-[var(--border)] hover:bg-[var(--bg-hover)]">
                <td className="py-2 pr-3 font-medium">{i.number ?? <span className="text-[var(--fg-muted)]">Brouillon</span>}</td>
                <td className="pr-3">{KIND_LABELS[i.kind]}</td>
                <td className="pr-3">{client ? clientDisplayName(client) : <span className="text-[var(--fg-muted)]">—</span>}</td>
                <td className="pr-3">{formatDateFr(i.issue_date)}</td>
                <td className="pr-3">{i.kind === 'credit' ? '—' : formatDateFr(i.due_date)}</td>
                <td className="pr-3 text-right tabular-nums">{formatEuros(total)}</td>
                <td className="pl-3"><Chip label={DISPLAY_LABELS[status]} color={DISPLAY_COLORS[status]} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {shown.length === 0 && <p className="py-4 text-sm text-[var(--fg-muted)]">{invoices.length === 0 ? 'Aucune facture pour le moment.' : 'Aucune facture ne correspond.'}</p>}
    </div>
  )
}

// ───────────────────────── Éditeur ─────────────────────────

function ActivityLog({ id, version }: { id: string; version: string }) {
  const repo = useApp((s) => s.repo)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  useEffect(() => { void repo?.listAuditLog(id).then(setEntries) }, [repo, id, version])
  const labels: Record<string, string> = { issued: 'Émission', status: 'Changement de statut', pdf: 'PDF exporté' }
  if (entries.length === 0) return null
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">Journal d'activité</h2>
      <p className="mb-2 text-xs text-[var(--fg-muted)]">Chaque action sur une facture émise est inscrite ici. Ce journal ne peut ni être modifié ni être effacé.</p>
      <table className="w-full text-xs">
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-[var(--border)]">
              <td className="py-1 pr-3 text-[var(--fg-muted)]">{new Date(e.at).toLocaleString('fr-FR')}</td>
              <td className="pr-3">{labels[e.action] ?? e.action}</td>
              <td>{e.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InvoiceEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const store = useApp()
  const { clients, services, company, invoices, invoiceLines, quotes, repo, payments } = store
  const stored = invoices.find((i) => i.id === id)
  const [invoice, setInvoice] = useState<Invoice | null>(stored ?? null)
  const [lines, setLines] = useState<InvoiceLine[]>(() => invoiceLines.filter((l) => l.invoice_id === id).sort((a, b) => a.position - b.position))
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [ai, setAi] = useState(false)
  const [version, setVersion] = useState('0')
  const dirty = useRef(false)

  // Après l'émission, on recopie l'état enregistré (numéro, statut…).
  useEffect(() => {
    if (stored && stored.number && invoice && !invoice.number) setInvoice(stored)
    else if (stored && invoice && stored.status !== invoice.status) setInvoice({ ...invoice, status: stored.status })
  }, [stored, invoice])

  const locked = invoice ? !isInvoiceDraft(invoice) : true
  const credit = invoice?.kind === 'credit'

  useEffect(() => {
    if (!invoice || locked || !dirty.current) return
    setSaveState('saving')
    const t = window.setTimeout(() => {
      store.saveInvoiceDraft(invoice, lines).then(() => { dirty.current = false; setSaveState('saved') }, (e) => { setError(String(e)); setSaveState('error') })
    }, 700)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, lines])

  const client = clients.find((c) => c.id === invoice?.client_id)
  const ctx = useMemo(() => ({ invoices, invoiceLines }), [invoices, invoiceLines])
  const blockers = useMemo(() => (invoice ? blockersToIssue(invoice, lines, client, company, ctx) : []), [invoice, lines, client, company, ctx])
  const warnings = invoice ? invoiceWarnings(invoice, client, company) : []
  const total = invoiceTotalCents(lines)
  const subtotal = lines.filter((l) => l.line_kind === 'item').reduce((s, l) => s + lineTotalCents(l), 0)
  const quote = quotes.find((q) => q.id === invoice?.quote_id)
  const related = invoices.find((i) => i.id === invoice?.related_invoice_id)

  const pdfData = useMemo((): InvoicePdfData | null => {
    if (!invoice) return null
    const snap = parseInvoiceSnapshot(invoice.snapshot)
    const c = snap?.client ?? client
    if (!c) return null
    const { logo: _logo, ...liveCompany } = company
    void _logo
    return {
      invoice, lines, client: c,
      company: snap?.company ?? liveCompany,
      logo: company.logo,
      vatMention: snap?.vatMention ?? vatMention(company, invoice.issue_date),
      quoteNumber: snap ? snap.quoteNumber : (quote?.number ?? null),
      relatedNumber: snap ? snap.relatedNumber : (related?.number ?? null),
    }
  }, [invoice, lines, client, company, quote, related])

  if (!invoice) return <div className="p-10"><button className={secondary} onClick={onBack}>← Retour</button><p className="mt-4">Cette facture n'existe plus.</p></div>

  const today = todayISO()
  const st = displayStatus(invoice, today, isFullyCredited(invoice, invoices, invoiceLines))
  const patch = (p: Partial<Invoice>) => { dirty.current = true; setInvoice({ ...invoice, ...p }) }
  const patchLines = (next: InvoiceLine[]) => { dirty.current = true; setLines(next) }
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const issue = () => run(async () => {
    const what = credit ? "Émettre cet avoir ?" : 'Émettre cette facture ?'
    if (!window.confirm(`${what} Elle recevra son numéro définitif et ne pourra plus jamais être modifiée : en cas d'erreur, il faudra la corriger par un avoir.`)) return
    if (dirty.current) await store.saveInvoiceDraft(invoice, lines)
    dirty.current = false
    await store.issueInvoice(invoice.id)
    setVersion(String(Date.now()))
  })

  const download = () => run(async () => {
    if (!pdfData) throw new Error('Choisis un client pour générer le PDF.')
    const { renderInvoicePdf } = await import('@/lib/pdf/invoicePdf')
    const blob = await renderInvoicePdf(pdfData)
    const saved = await savePdf(blob, `${invoice.number ?? 'Facture-brouillon'}.pdf`)
    if (saved) {
      if (invoice.number) { await repo?.logAudit({ entity: 'invoice', entityId: invoice.id, number: invoice.number, action: 'pdf', detail: 'PDF exporté' }); setVersion(String(Date.now())) }
      useApp.setState({ toast: 'PDF enregistré.' })
      window.setTimeout(() => useApp.setState({ toast: null }), 3000)
    }
  })

  const creditedSoFar = invoice.number && !credit ? creditedSoFarCents(invoice.id, invoices, invoiceLines) : 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-12 py-8">
        <button className="mb-3 flex items-center gap-1 text-sm text-[var(--fg-muted)] hover:underline" onClick={onBack}><ArrowLeft size={14} /> Toutes les factures</button>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">{invoice.number ?? `${credit ? 'Nouvel' : 'Nouvelle'} ${KIND_LABELS[invoice.kind].toLowerCase()}`}</h1>
          <Chip label={KIND_LABELS[invoice.kind]} color="#e8deee" />
          <Chip label={DISPLAY_LABELS[st]} color={DISPLAY_COLORS[st]} />
          {!locked && <span className="text-xs text-[var(--fg-muted)]">{saveState === 'saving' ? 'Enregistrement…' : saveState === 'error' ? 'Erreur d’enregistrement' : 'Enregistré'}</span>}
        </div>
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          {quote && <button className="text-[var(--accent)] hover:underline" onClick={() => { store.openQuote(quote.id) }}>Devis {quote.number}</button>}
          {related && <button className="text-[var(--accent)] hover:underline" onClick={() => store.openInvoice(related.id)}>Facture corrigée : {related.number}</button>}
        </div>

        {locked && (
          <div className="mb-4 rounded border border-[var(--border)] bg-[var(--bg-side)] p-3 text-sm">
            🔒 {credit ? 'Cet avoir est émis : il est définitif' : 'Cette facture est émise : elle est définitive'} et ne peut plus être modifié{credit ? '' : 'e'}.
            {!credit && ' Pour corriger une erreur, crée un avoir : il annule la facture, puis tu en refais une nouvelle.'}
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4">
          <Row label="Client">
            <select className={field} disabled={locked || credit} value={invoice.client_id ?? ''} onChange={(e) => patch({ client_id: e.target.value || null })}>
              <option value="">— Choisir un client —</option>
              {clients.filter((c) => !c.archived_at || c.id === invoice.client_id).map((c) => <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>)}
            </select>
          </Row>
          <Row label="Objet"><input className={field} disabled={locked} value={invoice.title} onChange={(e) => patch({ title: e.target.value })} /></Row>
        </div>
        <div className="grid grid-cols-4 gap-x-4">
          <Row label="Date de la facture">
            <input type="date" className={field} disabled={locked} value={invoice.issue_date}
              onChange={(e) => e.target.value && patch({ issue_date: e.target.value, due_date: credit ? e.target.value : addDays(e.target.value, invoice.payment_days) })} />
          </Row>
          <Row label="Date de la prestation">
            <input type="date" className={field} disabled={locked} value={invoice.service_date} onChange={(e) => patch({ service_date: e.target.value })} />
          </Row>
          <Row label="…jusqu'au (facultatif)">
            <input type="date" className={field} disabled={locked} value={invoice.service_date_end ?? ''} onChange={(e) => patch({ service_date_end: e.target.value || null })} />
          </Row>
          {!credit && (
            <Row label="Échéance">
              <input type="date" className={field} disabled={locked} value={invoice.due_date} onChange={(e) => e.target.value && patch({ due_date: e.target.value, payment_days: Math.max(0, Math.round((Date.parse(e.target.value) - Date.parse(invoice.issue_date)) / 86400000)) })} />
            </Row>
          )}
        </div>

        <h2 className="mb-2 mt-2 text-lg font-semibold">Lignes</h2>
        <div className="mb-1 flex gap-2 pr-9 text-xs text-[var(--fg-muted)]">
          <div className="flex-1">Prestation</div><div className="w-20">Quantité</div><div className="w-24">Unité</div><div className="w-28 text-right">Prix unit. HT</div><div className="w-28 text-right">Total HT</div>
        </div>
        {lines.map((l, i) => (
          <LineRow
            key={l.id} line={l} locked={locked} first={i === 0} last={i === lines.length - 1} allowNegative={credit || l.line_kind === 'deposit_deduction'}
            onChange={(nl) => patchLines(lines.map((x) => (x.id === l.id ? nl : x)))}
            onRemove={() => patchLines(lines.filter((x) => x.id !== l.id))}
            onMove={(dir) => { const next = [...lines]; const j = i + dir; [next[i], next[j]] = [next[j], next[i]]; patchLines(next) }}
          />
        ))}
        {lines.length === 0 && <p className="mb-2 text-sm text-[var(--fg-muted)]">Aucune ligne pour le moment.</p>}
        {!locked && !credit && (
          <div className="mb-4 flex items-center gap-2">
            <button className={secondary} onClick={() => patchLines([...lines, newInvoiceLine(invoice.id, lines.length)])}><Plus size={14} className="mr-1 inline" /> Ligne vide</button>
            <button className={secondary} onClick={() => setAi(true)}>✨ Lignes depuis un texte</button>
            <select className={field + ' max-w-xs'} value="" onChange={(e) => {
              const s = services.find((x) => x.id === e.target.value)
              if (s) patchLines([...lines, newInvoiceLine(invoice.id, lines.length, { service_id: s.id, label: s.label, description: s.description, unit: s.unit, unit_price_cents: s.unit_price_cents })])
            }}>
              <option value="">+ Depuis le catalogue de prestations…</option>
              {services.filter((s) => !s.archived_at).map((s) => <option key={s.id} value={s.id}>{s.label} — {formatEuros(s.unit_price_cents)} / {s.unit}</option>)}
            </select>
          </div>
        )}
        {credit && !locked && <p className="mb-3 text-xs text-[var(--fg-muted)]">L'avoir reprend toute la facture en négatif. Pour un avoir partiel, supprime des lignes ou réduis les quantités.</p>}

        <div className="mb-4 ml-auto w-96 text-sm">
          <div className="flex justify-between border-b border-[var(--border)] py-1"><span>Sous-total HT</span><span className="tabular-nums">{formatEuros(subtotal)}</span></div>
          {lines.filter((l) => l.line_kind === 'deposit_deduction').map((l) => (
            <div key={l.id} className="flex justify-between border-b border-[var(--border)] py-1"><span className="truncate pr-2">{l.label}</span><span className="tabular-nums">{formatEuros(lineTotalCents(l))}</span></div>
          ))}
          <div className="border-b border-[var(--border)] py-1 text-xs text-[var(--fg-muted)]">{vatMention(company, invoice.issue_date)}</div>
          <div className="flex justify-between border-b border-[var(--border)] py-1 font-semibold"><span>{credit ? "Total de l'avoir" : 'Total à payer'}</span><span className="tabular-nums">{formatEuros(total)}</span></div>
          {creditedSoFar > 0 && <div className="py-1 text-xs text-[var(--fg-muted)]">Déjà annulé par des avoirs : {formatEuros(creditedSoFar)}</div>}
        </div>

        <Row label="Notes (affichées sur la facture)">
          <textarea className={field + ' h-16'} disabled={locked} value={invoice.notes} onChange={(e) => patch({ notes: e.target.value })} />
        </Row>

        {error && <div className="mb-3 rounded border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-500">{error}</div>}
        {!locked && warnings.map((w) => <div key={w} className="mb-2 rounded border border-[var(--border)] p-2 text-xs text-[var(--fg-muted)]">⚠ {w}</div>)}
        {!locked && blockers.length > 0 && (
          <div className="mb-3 rounded border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
            <strong>Pour émettre :</strong>
            <ul className="ml-5 list-disc">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            <div className="mt-1 text-xs text-[var(--fg-muted)]">Tu peux quand même enregistrer le brouillon et voir le PDF.</div>
          </div>
        )}

        <div className="sticky bottom-0 -mx-12 flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--bg)] px-12 py-3">
          <button className={secondary} onClick={() => setPreview(!preview)} disabled={!pdfData}>{preview ? 'Masquer l’aperçu' : 'Aperçu PDF'}</button>
          <button className={secondary} onClick={() => void download()} disabled={!pdfData}>Télécharger le PDF</button>
          {!locked && <button className={primary} disabled={blockers.length > 0} onClick={() => void issue()}>{credit ? "Émettre l'avoir (numéroter)" : 'Émettre la facture (numéroter)'}</button>}
          <div className="flex-1" />
          {locked && !credit && <button className={secondary} onClick={() => { if (window.confirm('Créer un avoir qui annule cette facture ?')) void run(() => store.createCredit(invoice.id)) }}>Créer un avoir</button>}
          {!locked && (
            <button className={secondary + ' text-red-500'} onClick={() => { if (window.confirm('Supprimer ce brouillon ?')) void run(() => store.deleteDraftInvoice(invoice.id)) }}>Supprimer le brouillon</button>
          )}
        </div>

        {ai && (
          <AssistantModal
            onClose={() => setAi(false)}
            onApplyLines={(added) => patchLines([...lines, ...added.map((l, i) => newInvoiceLine(invoice.id, lines.length + i, { label: l.label, description: l.description, quantity_milli: l.quantity_milli, unit: l.unit, unit_price_cents: l.unit_price_cents ?? 0 }))])}
          />
        )}

        {preview && pdfData && <PdfPreview data={pdfData} />}
        {locked && !credit && <InvoicePayments invoice={invoice} remaining={remainingCents(invoice, invoices, invoiceLines, payments)} />}
        {locked && <ActivityLog id={invoice.id} version={version + invoice.status + payments.length} />}
      </div>
    </div>
  )
}

function PdfPreview({ data }: { data: InvoicePdfData }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(data)

  useEffect(() => {
    let cancelled = false
    let current: string | null = null
    const t = window.setTimeout(async () => {
      try {
        const { renderInvoicePdf } = await import('@/lib/pdf/invoicePdf')
        const blob = await renderInvoicePdf(data)
        if (cancelled) return
        current = URL.createObjectURL(blob)
        setUrl(current)
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }, 600)
    return () => {
      cancelled = true
      window.clearTimeout(t)
      if (current) URL.revokeObjectURL(current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (
    <div className="mt-4 rounded border border-[var(--border)]">
      {error && <div className="p-3 text-sm text-red-500">Impossible de générer l’aperçu : {error}</div>}
      {!url && !error && <div className="p-3 text-sm text-[var(--fg-muted)]">Génération du PDF…</div>}
      {url && <iframe title="Aperçu de la facture" src={url} className="h-[80vh] w-full rounded bg-white" />}
    </div>
  )
}
