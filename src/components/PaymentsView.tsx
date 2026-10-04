import { useMemo, useState } from 'react'
import { clientDisplayName, formatEuros } from '@/lib/business'
import { todayISO } from '@/lib/backup'
import {
  bookTotalCents, METHOD_LABELS, monthlyTotals, paymentYears, receivables, recipeBook, recipeBookCsv, toChase, type Receivable,
} from '@/lib/payments'
import { saveCsv, savePdf } from '@/lib/pdf/savePdf'
import { formatDateFr } from '@/lib/quotes'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { PaymentForm, ReminderModal } from '@/components/PaymentParts'

const field = 'rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]'
const secondary = 'rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'
const MONTHS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']

export function PaymentsView() {
  const [tab, setTab] = useState<'due' | 'book'>('due')
  return (
    <div>
      <div className="flex gap-1 border-b border-[var(--border)] px-12 pt-6">
        {([['due', 'À encaisser'], ['book', 'Livre des recettes']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn('border-b-2 px-3 py-1.5 text-sm', tab === id ? 'border-[var(--fg)] font-medium' : 'border-transparent text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'due' ? <ToCollect /> : <RecipeBook />}
    </div>
  )
}

function ToCollect() {
  const { invoices, invoiceLines, payments, clients, company, openInvoice } = useApp()
  const today = todayISO()
  const [paying, setPaying] = useState<Receivable | null>(null)
  const [chasing, setChasing] = useState<Receivable | null>(null)
  const list = useMemo(() => receivables(invoices, invoiceLines, payments, today), [invoices, invoiceLines, payments, today])
  const total = list.reduce((s, r) => s + r.remaining, 0)
  const late = list.filter((r) => r.daysLate > 0).reduce((s, r) => s + r.remaining, 0)
  const toRemind = toChase(list, company.reminderAfterDays).length

  return (
    <div className="mx-auto max-w-5xl px-12 py-8">
      <h1 className="mb-4 text-3xl font-bold">À encaisser</h1>
      <div className="mb-4 flex gap-6 text-sm">
        <div><div className="text-xs text-[var(--fg-muted)]">Total à encaisser</div><div className="text-xl font-semibold tabular-nums">{formatEuros(total)}</div></div>
        <div><div className="text-xs text-[var(--fg-muted)]">Dont en retard</div><div className="text-xl font-semibold tabular-nums text-red-500">{formatEuros(late)}</div></div>
        <div><div className="text-xs text-[var(--fg-muted)]">À relancer (+{company.reminderAfterDays} j)</div><div className="text-xl font-semibold">{toRemind}</div></div>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--fg-muted)]">
            <th className="py-2 pr-3 font-semibold">Facture</th>
            <th className="pr-3 font-semibold">Client</th>
            <th className="pr-3 font-semibold">Échéance</th>
            <th className="pr-3 text-right font-semibold">Reste dû</th>
            <th className="pl-3 font-semibold">Retard</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const client = clients.find((c) => c.id === r.invoice.client_id)
            const needsChase = r.daysLate >= company.reminderAfterDays
            return (
              <tr key={r.invoice.id} className="border-b border-[var(--border)]">
                <td className="py-2 pr-3"><button className="font-medium text-[var(--accent)] hover:underline" onClick={() => openInvoice(r.invoice.id)}>{r.invoice.number}</button></td>
                <td className="pr-3">{client ? clientDisplayName(client) : '—'}</td>
                <td className="pr-3">{formatDateFr(r.invoice.due_date)}</td>
                <td className="pr-3 text-right tabular-nums">{formatEuros(r.remaining)}</td>
                <td className={cn('pl-3', r.daysLate > 0 && 'text-red-500')}>{r.daysLate > 0 ? `${r.daysLate} j` : r.daysLate === 0 ? "Aujourd'hui" : `dans ${-r.daysLate} j`}</td>
                <td className="whitespace-nowrap py-1 text-right">
                  {r.daysLate > 0 && (
                    <button className={secondary + (needsChase ? ' border-yellow-500' : '') + ' mr-2'} onClick={() => setChasing(r)}>Relancer</button>
                  )}
                  <button className={secondary} onClick={() => setPaying(r)}>Encaisser</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {list.length === 0 && <p className="py-4 text-sm text-[var(--fg-muted)]">Rien à encaisser : toutes tes factures émises sont payées.</p>}
      {paying && <PaymentForm invoice={paying.invoice} remaining={paying.remaining} onClose={() => setPaying(null)} />}
      {chasing && <ReminderModal item={chasing} onClose={() => setChasing(null)} />}
    </div>
  )
}

function RecipeBook() {
  const { payments, invoices, clients, company } = useApp()
  const today = todayISO()
  const years = paymentYears(payments, today)
  const [year, setYear] = useState(years[0])
  const rows = useMemo(() => recipeBook(payments, invoices, clients, year), [payments, invoices, clients, year])
  const monthly = monthlyTotals(rows)
  const max = Math.max(...monthly, 1)
  const [message, setMessage] = useState<string | null>(null)

  const flash = (m: string) => { setMessage(m); window.setTimeout(() => setMessage(null), 3000) }
  const exportCsv = async () => {
    try {
      const saved = await saveCsv(recipeBookCsv(rows), `Livre-des-recettes-${year}.csv`)
      if (saved) flash('CSV enregistré.')
    } catch (e) { flash(`Erreur : ${e instanceof Error ? e.message : String(e)}`) }
  }
  const exportPdf = async () => {
    try {
      const { logo: _logo, ...rest } = company
      void _logo
      const { renderBookPdf } = await import('@/lib/pdf/bookPdf')
      const saved = await savePdf(await renderBookPdf({ company: rest, year, rows }), `Livre-des-recettes-${year}.pdf`)
      if (saved) flash('PDF enregistré.')
    } catch (e) { flash(`Erreur : ${e instanceof Error ? e.message : String(e)}`) }
  }

  return (
    <div className="mx-auto max-w-5xl px-12 py-8">
      <h1 className="mb-4 text-3xl font-bold">Livre des recettes</h1>
      <div className="mb-4 flex items-center gap-3">
        <select className={field} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="text-sm">Total encaissé en {year} : <strong className="tabular-nums">{formatEuros(bookTotalCents(rows))}</strong></div>
        <div className="flex-1" />
        {message && <span className="text-sm text-green-600">{message}</span>}
        <button className={secondary} onClick={() => void exportCsv()}>Exporter en CSV</button>
        <button className={secondary} onClick={() => void exportPdf()}>Exporter en PDF</button>
      </div>

      <div className="mb-5 flex h-24 items-end gap-2 border-b border-[var(--border)] pb-1">
        {monthly.map((cents, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end" title={`${MONTHS[i]} : ${formatEuros(cents)}`}>
            <div className="w-full rounded-t bg-[var(--accent)] opacity-70" style={{ height: `${(cents / max) * 72}px`, minHeight: cents > 0 ? 2 : 0 }} />
            <div className="mt-1 text-[10px] text-[var(--fg-muted)]">{MONTHS[i]}</div>
          </div>
        ))}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--fg-muted)]">
            <th className="py-2 pr-3 font-semibold">Date</th>
            <th className="pr-3 font-semibold">Client</th>
            <th className="pr-3 font-semibold">N° de facture</th>
            <th className="pr-3 font-semibold">Moyen</th>
            <th className="text-right font-semibold">Montant</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.payment.id} className="border-b border-[var(--border)]">
              <td className="py-2 pr-3">{formatDateFr(r.payment.paid_on)}</td>
              <td className="pr-3">{r.clientName}</td>
              <td className="pr-3">{r.invoiceNumber}</td>
              <td className="pr-3">{METHOD_LABELS[r.payment.method]}</td>
              <td className="text-right tabular-nums">{formatEuros(r.payment.amount_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-4 text-sm text-[var(--fg-muted)]">Aucun encaissement en {year}.</p>}
      <p className="mt-4 text-xs text-[var(--fg-muted)]">Le livre des recettes liste les encaissements dans l'ordre chronologique. Il se remplit tout seul quand tu enregistres un paiement.</p>
    </div>
  )
}
