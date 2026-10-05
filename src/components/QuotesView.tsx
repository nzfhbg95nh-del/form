import { useEffect, useMemo, useRef, useState } from 'react'
import { AssistantModal } from '@/components/AssistantModal'
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { centsToInput, clientDisplayName, formatEuros, parseEuros, parseSignedEuros, UNITS } from '@/lib/business'
import { vatMention } from '@/lib/company'
import { DISPLAY_COLORS, DISPLAY_LABELS, displayStatus, invoiceTotalCents, KIND_LABELS } from '@/lib/invoices'
import { todayISO } from '@/lib/backup'
import { isFullyCredited } from '@/lib/payments'
import {
  blockersToSend, depositCents, formatDateFr, formatQuantity, isDraft, lineTotalCents, newLine, parseQuantity, parseSnapshot,
  quoteTotalCents, STATUS_COLORS, STATUS_LABELS, addDays,
} from '@/lib/quotes'
import type { QuotePdfData } from '@/lib/pdf/quotePdf'
import { savePdf } from '@/lib/pdf/savePdf'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import type { Quote, QuoteLine, QuoteStatus } from '@/lib/types'

const field = 'w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-70'
const primary = 'rounded bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-40'
const secondary = 'rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'

function StatusChip({ status }: { status: QuoteStatus }) {
  return <span className="rounded px-2 py-0.5 text-xs" style={{ background: STATUS_COLORS[status], color: '#37352f' }}>{STATUS_LABELS[status]}</span>
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

export function QuotesView() {
  const { quotes, quoteLines, clients, openQuoteId, openQuote, createQuote } = useApp()
  const [filter, setFilter] = useState<'all' | QuoteStatus>('all')
  if (openQuoteId) return <QuoteEditor key={openQuoteId} id={openQuoteId} onBack={() => openQuote(null)} />

  const shown = quotes.filter((q) => filter === 'all' || q.status === filter)
  return (
    <div className="mx-auto max-w-5xl px-12 py-10">
      <h1 className="mb-4 text-3xl font-bold">Devis</h1>
      <div className="mb-3 flex items-center gap-3">
        <select className={field + ' max-w-[200px]'} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">Tous les statuts</option>
          {(Object.keys(STATUS_LABELS) as QuoteStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <div className="flex-1" />
        <button className={primary + ' flex items-center gap-1'} onClick={() => void createQuote()}><Plus size={14} /> Nouveau devis</button>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--fg-muted)]">
            <th className="py-2 pr-3 font-semibold">Numéro</th>
            <th className="pr-3 font-semibold">Client</th>
            <th className="pr-3 font-semibold">Objet</th>
            <th className="pr-3 font-semibold">Date</th>
            <th className="pr-3 text-right font-semibold">Total</th>
            <th className="pl-3 font-semibold">Statut</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((q) => {
            const client = clients.find((c) => c.id === q.client_id)
            const total = quoteTotalCents(quoteLines.filter((l) => l.quote_id === q.id))
            return (
              <tr key={q.id} onClick={() => openQuote(q.id)} className="cursor-pointer border-b border-[var(--border)] hover:bg-[var(--bg-hover)]">
                <td className="py-2 pr-3 font-medium">{q.number ?? <span className="text-[var(--fg-muted)]">Brouillon</span>}</td>
                <td className="pr-3">{client ? clientDisplayName(client) : <span className="text-[var(--fg-muted)]">—</span>}</td>
                <td className="max-w-xs truncate pr-3">{q.title}</td>
                <td className="pr-3">{formatDateFr(q.issue_date)}</td>
                <td className="pr-3 text-right tabular-nums">{formatEuros(total)}</td>
                <td className="pl-3"><StatusChip status={q.status} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {shown.length === 0 && <p className="py-4 text-sm text-[var(--fg-muted)]">{quotes.length === 0 ? 'Aucun devis pour le moment.' : 'Aucun devis avec ce statut.'}</p>}
    </div>
  )
}

// ───────────────────────── Ligne de devis ─────────────────────────

export interface LineLike {
  label: string
  description: string
  quantity_milli: number
  unit: string
  unit_price_cents: number
}

/** Une ligne de devis ou de facture. `allowNegative` : un avoir peut avoir des prix négatifs. */
export function LineRow<T extends LineLike>({
  line, locked, first, last, onChange, onRemove, onMove, allowNegative = false,
}: {
  line: T
  locked: boolean
  first: boolean
  last: boolean
  onChange: (l: T) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  allowNegative?: boolean
}) {
  const parsePrice = allowNegative ? parseSignedEuros : parseEuros
  const [qty, setQty] = useState(formatQuantity(line.quantity_milli))
  const [price, setPrice] = useState(centsToInput(line.unit_price_cents))
  useEffect(() => setQty(formatQuantity(line.quantity_milli)), [line.quantity_milli])
  useEffect(() => setPrice(centsToInput(line.unit_price_cents)), [line.unit_price_cents])
  const qtyOk = parseQuantity(qty) !== null
  const priceOk = parsePrice(price) !== null

  return (
    <div className="mb-2 rounded border border-[var(--border)] p-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input className={field} placeholder="Libellé de la prestation" value={line.label} disabled={locked} onChange={(e) => onChange({ ...line, label: e.target.value })} />
          <textarea className={field + ' mt-1 h-14 text-xs'} placeholder="Détails (facultatif)" value={line.description} disabled={locked} onChange={(e) => onChange({ ...line, description: e.target.value })} />
        </div>
        <div className="w-20">
          <input
            className={field + (qtyOk ? '' : ' border-red-500')}
            value={qty}
            disabled={locked}
            aria-label="Quantité"
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => { const m = parseQuantity(qty); if (m !== null) onChange({ ...line, quantity_milli: m }); else setQty(formatQuantity(line.quantity_milli)) }}
          />
        </div>
        <div className="w-24">
          <select className={field} value={line.unit} disabled={locked} aria-label="Unité" onChange={(e) => onChange({ ...line, unit: e.target.value })}>
            {[...new Set([...UNITS, line.unit])].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="w-28">
          <input
            className={field + ' text-right' + (priceOk ? '' : ' border-red-500')}
            value={price}
            disabled={locked}
            aria-label="Prix unitaire HT"
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => { const c = parsePrice(price); if (c !== null) onChange({ ...line, unit_price_cents: c }); else setPrice(centsToInput(line.unit_price_cents)) }}
          />
        </div>
        <div className="w-28 pt-2 text-right text-sm tabular-nums">{formatEuros(lineTotalCents(line))}</div>
        {!locked && (
          <div className="flex flex-col">
            <button title="Monter" disabled={first} onClick={() => onMove(-1)} className="rounded p-0.5 hover:bg-[var(--bg-hover)] disabled:opacity-30"><ChevronUp size={14} /></button>
            <button title="Descendre" disabled={last} onClick={() => onMove(1)} className="rounded p-0.5 hover:bg-[var(--bg-hover)] disabled:opacity-30"><ChevronDown size={14} /></button>
            <button title="Supprimer la ligne" onClick={onRemove} className="rounded p-0.5 text-red-500 hover:bg-[var(--bg-hover)]"><Trash2 size={14} /></button>
          </div>
        )}
      </div>
    </div>
  )
}

// ───────────────────────── Éditeur ─────────────────────────

function QuoteEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const store = useApp()
  const { clients, services, company, quotes, quoteLines, logoOf } = {
    ...store,
    logoOf: store.company.logo,
  }
  const stored = quotes.find((q) => q.id === id)
  const [quote, setQuote] = useState<Quote | null>(stored ?? null)
  const [lines, setLines] = useState<QuoteLine[]>(() => quoteLines.filter((l) => l.quote_id === id).sort((a, b) => a.position - b.position))
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [ai, setAi] = useState(false)
  const dirty = useRef(false)

  // Quand le devis est envoyé / accepté / refusé, on recopie son état enregistré (numéro, statut…).
  useEffect(() => {
    if (stored && stored.number && quote && !quote.number) setQuote(stored)
    else if (stored && quote && stored.status !== quote.status) setQuote({ ...quote, status: stored.status })
  }, [stored, quote])

  const locked = quote ? !isDraft(quote) : true

  // Enregistrement automatique des brouillons, 700 ms après la dernière modification.
  useEffect(() => {
    if (!quote || locked || !dirty.current) return
    setSaveState('saving')
    const t = window.setTimeout(() => {
      store.saveQuoteDraft(quote, lines).then(() => { dirty.current = false; setSaveState('saved') }, (e) => { setError(String(e)); setSaveState('error') })
    }, 700)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, lines])

  const client = clients.find((c) => c.id === quote?.client_id)
  const blockers = useMemo(() => (quote ? blockersToSend(quote, lines, client, company) : []), [quote, lines, client, company])
  const total = quoteTotalCents(lines)

  const pdfData = useMemo((): QuotePdfData | null => {
    if (!quote) return null
    const snap = parseSnapshot(quote.snapshot)
    const c = snap?.client ?? client
    if (!c) return null
    const { logo: _logo, ...liveCompany } = company
    void _logo
    return {
      quote, lines, client: c,
      company: snap?.company ?? liveCompany,
      logo: logoOf,
      vatMention: snap?.vatMention ?? vatMention(company, quote.issue_date),
      isDraft: isDraft(quote),
    }
  }, [quote, lines, client, company, logoOf])

  if (!quote) return <div className="p-10"><button className={secondary} onClick={onBack}>← Retour</button><p className="mt-4">Ce devis n'existe plus.</p></div>

  const patchQuote = (p: Partial<Quote>) => { dirty.current = true; setQuote({ ...quote, ...p }) }
  const patchLines = (next: QuoteLine[]) => { dirty.current = true; setLines(next) }
  const addService = (serviceId: string) => {
    const s = services.find((x) => x.id === serviceId)
    if (s) patchLines([...lines, newLine(quote.id, lines.length, s)])
  }
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const send = () => run(async () => {
    if (!window.confirm(`Envoyer ce devis ? Il recevra son numéro définitif et ne pourra plus être modifié.`)) return
    if (dirty.current) await store.saveQuoteDraft(quote, lines)
    dirty.current = false
    await store.issueQuote(quote.id)
  })

  const download = () => run(async () => {
    if (!pdfData) throw new Error('Choisis un client pour générer le PDF.')
    const { renderQuotePdf } = await import('@/lib/pdf/quotePdf')
    const blob = await renderQuotePdf(pdfData)
    const saved = await savePdf(blob, `Devis-${quote.number ?? 'brouillon'}.pdf`)
    if (saved) useApp.setState({ toast: 'PDF enregistré.' })
    window.setTimeout(() => useApp.setState({ toast: null }), 3000)
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-12 py-8">
        <button className="mb-3 flex items-center gap-1 text-sm text-[var(--fg-muted)] hover:underline" onClick={onBack}><ArrowLeft size={14} /> Tous les devis</button>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">{quote.number ?? 'Nouveau devis'}</h1>
          <StatusChip status={quote.status} />
          {!locked && <span className="text-xs text-[var(--fg-muted)]">{saveState === 'saving' ? 'Enregistrement…' : saveState === 'error' ? 'Erreur d’enregistrement' : 'Enregistré'}</span>}
        </div>

        {locked && (
          <div className="mb-4 rounded border border-[var(--border)] bg-[var(--bg-side)] p-3 text-sm">
            🔒 Ce devis est envoyé : son contenu est figé. Pour le modifier, dupliquez-le en nouveau brouillon.
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4">
          <Row label="Client">
            <select className={field} disabled={locked} value={quote.client_id ?? ''} onChange={(e) => patchQuote({ client_id: e.target.value || null })}>
              <option value="">— Choisir un client —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>)}
            </select>
          </Row>
          <Row label="Objet du devis"><input className={field} disabled={locked} value={quote.title} onChange={(e) => patchQuote({ title: e.target.value })} /></Row>
        </div>
        <div className="grid grid-cols-4 gap-x-4">
          <Row label="Date du devis">
            <input type="date" className={field} disabled={locked} value={quote.issue_date}
              onChange={(e) => e.target.value && patchQuote({ issue_date: e.target.value, valid_until: addDays(e.target.value, company.quoteValidityDays) })} />
          </Row>
          <Row label="Valable jusqu'au"><input type="date" className={field} disabled={locked} value={quote.valid_until} onChange={(e) => e.target.value && patchQuote({ valid_until: e.target.value })} /></Row>
          <Row label="Acompte (%)">
            <input type="number" min={0} max={100} className={field} disabled={locked} value={quote.deposit_percent} onChange={(e) => patchQuote({ deposit_percent: Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))) })} />
          </Row>
          <Row label="Retouches incluses">
            <input type="number" min={0} className={field} disabled={locked} value={quote.included_revisions ?? ''} placeholder="—" onChange={(e) => patchQuote({ included_revisions: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })} />
          </Row>
        </div>

        <h2 className="mb-2 mt-2 text-lg font-semibold">Lignes</h2>
        <div className="mb-1 flex gap-2 pr-9 text-xs text-[var(--fg-muted)]">
          <div className="flex-1">Prestation</div><div className="w-20">Quantité</div><div className="w-24">Unité</div><div className="w-28 text-right">Prix unit. HT</div><div className="w-28 text-right">Total HT</div>
        </div>
        {lines.map((l, i) => (
          <LineRow
            key={l.id} line={l} locked={locked} first={i === 0} last={i === lines.length - 1}
            onChange={(nl) => patchLines(lines.map((x) => (x.id === l.id ? nl : x)))}
            onRemove={() => patchLines(lines.filter((x) => x.id !== l.id))}
            onMove={(dir) => { const next = [...lines]; const j = i + dir; [next[i], next[j]] = [next[j], next[i]]; patchLines(next) }}
          />
        ))}
        {lines.length === 0 && <p className="mb-2 text-sm text-[var(--fg-muted)]">Aucune ligne pour le moment.</p>}
        {!locked && (
          <div className="mb-4 flex items-center gap-2">
            <button className={secondary} onClick={() => patchLines([...lines, newLine(quote.id, lines.length)])}><Plus size={14} className="mr-1 inline" /> Ligne vide</button>
            <button className={secondary} onClick={() => setAi(true)}>✨ Lignes depuis un texte</button>
            <select className={field + ' max-w-xs'} value="" onChange={(e) => e.target.value && addService(e.target.value)}>
              <option value="">+ Depuis mes tarifs…</option>
              {services.filter((s) => !s.archived_at).map((s) => <option key={s.id} value={s.id}>{s.label} — {formatEuros(s.unit_price_cents)} / {s.unit}</option>)}
            </select>
          </div>
        )}

        <div className="mb-4 ml-auto w-80 text-sm">
          <div className="flex justify-between border-b border-[var(--border)] py-1"><span>Total HT</span><span className="tabular-nums">{formatEuros(total)}</span></div>
          <div className="border-b border-[var(--border)] py-1 text-xs text-[var(--fg-muted)]">{vatMention(company, quote.issue_date)}</div>
          <div className="flex justify-between border-b border-[var(--border)] py-1 font-semibold"><span>Total</span><span className="tabular-nums">{formatEuros(total)}</span></div>
          {quote.deposit_percent > 0 && (
            <div className="flex justify-between py-1"><span>Acompte {quote.deposit_percent} %</span><span className="tabular-nums">{formatEuros(depositCents(total, quote.deposit_percent))}</span></div>
          )}
        </div>

        <Row label="Notes (affichées sur le devis)">
          <textarea className={field + ' h-16'} disabled={locked} value={quote.notes} onChange={(e) => patchQuote({ notes: e.target.value })} />
        </Row>

        {error && <div className="mb-3 rounded border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-500">{error}</div>}

        {!locked && blockers.length > 0 && (
          <div className="mb-3 rounded border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
            <strong>Pour envoyer ce devis :</strong>
            <ul className="ml-5 list-disc">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            <div className="mt-1 text-xs text-[var(--fg-muted)]">Tu peux quand même enregistrer le brouillon et voir le PDF.</div>
          </div>
        )}

        <div className="sticky bottom-0 -mx-12 flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--bg)] px-12 py-3">
          <button className={secondary} onClick={() => setPreview(!preview)} disabled={!pdfData}>{preview ? 'Masquer l’aperçu' : 'Aperçu PDF'}</button>
          <button className={secondary} onClick={() => void download()} disabled={!pdfData}>Télécharger le PDF</button>
          {!locked && <button className={primary} disabled={blockers.length > 0} onClick={() => void send()}>Envoyer le devis (numéroter)</button>}
          {locked && (['accepted', 'refused', 'sent'] as const).filter((s) => s !== quote.status).map((s) => (
            <button key={s} className={secondary} onClick={() => void run(() => store.setQuoteStatus(quote.id, s))}>
              {s === 'accepted' ? 'Marquer accepté' : s === 'refused' ? 'Marquer refusé' : 'Remettre « envoyé »'}
            </button>
          ))}
          <div className="flex-1" />
          <button className={secondary} onClick={() => void run(() => store.duplicateQuote(quote.id))}>Dupliquer</button>
          {!locked && (
            <button className={secondary + ' text-red-500'} onClick={() => { if (window.confirm('Supprimer ce brouillon ?')) void run(() => store.deleteDraftQuote(quote.id)) }}>Supprimer le brouillon</button>
          )}
        </div>

        {ai && (
          <AssistantModal
            onClose={() => setAi(false)}
            onApplyLines={(added) => patchLines([...lines, ...added.map((l, i) => ({ ...newLine(quote.id, lines.length + i), label: l.label, description: l.description, quantity_milli: l.quantity_milli, unit: l.unit, unit_price_cents: l.unit_price_cents ?? 0 }))])}
          />
        )}

        {(quote.status === 'accepted' || quote.status === 'sent') && <QuoteBilling quote={quote} />}

        {preview && pdfData && <PdfPreview data={pdfData} />}
      </div>
    </div>
  )
}

function PdfPreview({ data }: { data: QuotePdfData }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(data)

  // Le PDF est regénéré 600 ms après la dernière modification.
  useEffect(() => {
    let cancelled = false
    let current: string | null = null
    const t = window.setTimeout(async () => {
      try {
        const { renderQuotePdf } = await import('@/lib/pdf/quotePdf')
        const blob = await renderQuotePdf(data)
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
      {url && <iframe title="Aperçu du devis" src={url} className="h-[80vh] w-full rounded bg-white" />}
    </div>
  )
}

/** Facturation d'un devis accepté : acompte puis solde. */
function QuoteBilling({ quote }: { quote: Quote }) {
  const { invoices, invoiceLines, createDepositInvoice, createFinalInvoice, openInvoice, setQuoteStatus } = useApp()
  const linked = invoices.filter((i) => i.quote_id === quote.id && (i.kind === 'deposit' || i.kind === 'final'))
  const hasDeposit = linked.some((i) => i.kind === 'deposit')
  const hasFinal = linked.some((i) => i.kind === 'final')
  const today = todayISO()

  // Un devis encore « envoyé » peut générer son acompte : le client vient de le signer, il passe en « accepté ».
  const createDeposit = async () => {
    if (quote.status === 'sent') {
      if (!window.confirm("Le client a accepté ce devis ? Il passera en « Accepté » et l'acompte sera préparé.")) return
      await setQuoteStatus(quote.id, 'accepted')
    }
    await createDepositInvoice(quote.id)
  }

  return (
    <div className="mt-6 rounded border border-[var(--border)] p-4">
      <h2 className="mb-2 text-lg font-semibold">Facturation</h2>
      {linked.length === 0 && <p className="mb-2 text-sm text-[var(--fg-muted)]">Aucune facture pour ce devis.</p>}
      {linked.map((i) => {
        const st = displayStatus(i, today, isFullyCredited(i, invoices, invoiceLines))
        return (
          <button key={i.id} onClick={() => openInvoice(i.id)} className="mb-1 flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]">
            <span className="w-32 font-medium">{i.number ?? 'Brouillon'}</span>
            <span className="flex-1">{KIND_LABELS[i.kind]}</span>
            <span className="tabular-nums">{formatEuros(invoiceTotalCents(invoiceLines.filter((l) => l.invoice_id === i.id)))}</span>
            <span className="rounded px-2 py-0.5 text-xs" style={{ background: DISPLAY_COLORS[st], color: '#37352f' }}>{DISPLAY_LABELS[st]}</span>
          </button>
        )
      })}
      <div className="mt-3 flex flex-wrap gap-2">
        {!hasDeposit && quote.deposit_percent > 0 && (
          <button className={primary} onClick={() => void createDeposit()}>Créer la facture d'acompte ({quote.deposit_percent} %)</button>
        )}
        {!hasFinal && quote.status === 'accepted' && (
          <button className={secondary} onClick={() => void createFinalInvoice(quote.id)}>Créer la facture de solde</button>
        )}
      </div>
      {quote.status === 'sent' && <p className="mt-2 text-xs text-[var(--fg-muted)]">Le montant de l'acompte se règle dans le devis (pourcentage) et se modifie encore dans le brouillon de la facture.</p>}
      {hasDeposit && !hasFinal && <p className="mt-2 text-xs text-[var(--fg-muted)]">Émets d'abord la facture d'acompte : elle sera déduite automatiquement de la facture de solde.</p>}
    </div>
  )
}
