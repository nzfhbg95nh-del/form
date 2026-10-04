import { useMemo } from 'react'
import { clientDisplayName, formatEuros } from '@/lib/business'
import { todayISO } from '@/lib/backup'
import { missingForIssuing } from '@/lib/company'
import {
  collectedByMonth, collectedForMonth, collectedForYear, invoicedForYear, pendingQuotes, thresholdState, vatState, yearMonthOf,
  type Level, type VatLevel,
} from '@/lib/dashboard'
import { receivables, toChase } from '@/lib/payments'
import { formatDateFr } from '@/lib/quotes'
import { findDueTasks } from '@/lib/reminders'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

const MONTHS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']
const COLORS: Record<Level, string> = { ok: 'var(--accent)', near: '#e0a100', over: '#dc2626' }

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-[var(--border)] p-4', className)}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">{title}</h2>
      {children}
    </section>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--fg-muted)]">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-[var(--fg-muted)]">{hint}</div>}
    </div>
  )
}

function Bar({ ratio, level }: { ratio: number; level: Level }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-hover)]">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, background: COLORS[level] }} />
    </div>
  )
}

function Link({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button className="text-sm text-[var(--accent)] hover:underline" onClick={onClick}>{children}</button>
}

const VAT_TEXT: Record<VatLevel, string> = {
  ok: '',
  near: 'Tu approches du seuil de franchise de TVA.',
  over_base: 'Seuil de base dépassé : vérifie avec un comptable si tu restes en franchise (seuil majoré).',
  over_majored: 'Seuil majoré dépassé : la TVA peut devenir due. À vérifier sans attendre avec un comptable.',
}

export function DashboardView() {
  const { payments, invoices, invoiceLines, quotes, quoteLines, objects, clients, company, services, show, select, openInvoice } = useApp()
  const today = todayISO()
  const { year, month } = yearMonthOf(today)

  const data = useMemo(() => {
    const collectedYear = collectedForYear(payments, year)
    return {
      collectedYear,
      collectedMonth: collectedForMonth(payments, year, month),
      invoicedYear: invoicedForYear(invoices, invoiceLines, year),
      monthly: collectedByMonth(payments, year),
      receivable: receivables(invoices, invoiceLines, payments, today),
      tasks: findDueTasks(objects, today),
      quotes: pendingQuotes(quotes, quoteLines),
      micro: thresholdState(collectedYear, company.microCeilingCents),
      vat: vatState(collectedYear, company.vatBaseCents, company.vatMajoredCents),
    }
  }, [payments, invoices, invoiceLines, quotes, quoteLines, objects, company, today, year, month])

  const missing = missingForIssuing(company)
  const totalDue = data.receivable.reduce((s, r) => s + r.remaining, 0)
  const lateRows = data.receivable.filter((r) => r.daysLate > 0)
  const lateTotal = lateRows.reduce((s, r) => s + r.remaining, 0)
  const toRemind = toChase(data.receivable, company.reminderAfterDays).length
  const max = Math.max(...data.monthly, 1)
  const confirmed = company.thresholdsConfirmed

  return (
    <div className="mx-auto max-w-5xl px-12 py-10">
      <h1 className="mb-1 text-3xl font-bold">Tableau de bord</h1>
      <p className="mb-5 text-sm text-[var(--fg-muted)]">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

      {missing.length > 0 && (
        <div className="mb-4 rounded border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
          Pour pouvoir émettre de vraies factures, il manque encore : <strong>{missing.join(', ')}</strong>. <Link onClick={() => show('settings')}>Ouvrir les réglages</Link>
        </div>
      )}

      <div className="mb-4 grid grid-cols-4 gap-4">
        <Card title="Encaissé ce mois-ci"><Kpi label={MONTHS[month - 1]} value={formatEuros(data.collectedMonth)} /></Card>
        <Card title={`Encaissé en ${year}`}><Kpi label="Chiffre d'affaires" value={formatEuros(data.collectedYear)} hint={`Facturé : ${formatEuros(data.invoicedYear)}`} /></Card>
        <Card title="À encaisser"><Kpi label="Factures émises impayées" value={formatEuros(totalDue)} hint={lateRows.length > 0 ? `${formatEuros(lateTotal)} en retard` : 'Aucun retard'} /></Card>
        <Card title="Devis"><Kpi label="En attente de réponse" value={String(data.quotes.waiting)} hint={data.quotes.waiting > 0 ? formatEuros(data.quotes.waitingCents) : `${data.quotes.drafts} brouillon${data.quotes.drafts > 1 ? 's' : ''}`} /></Card>
      </div>

      <Card title={`Plafonds ${year}`} className="mb-4">
        {!confirmed && (
          <div className="mb-3 rounded border border-[var(--border)] p-2 text-xs text-[var(--fg-muted)]">
            Ces plafonds n'ont pas encore été vérifiés : les alertes sont indicatives. <Link onClick={() => show('settings')}>Les vérifier dans Réglages &gt; Entreprise</Link>
          </div>
        )}
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-sm">
            <span>Plafond de chiffre d'affaires de la micro-entreprise</span>
            <span className="tabular-nums">{formatEuros(data.collectedYear)} / {formatEuros(company.microCeilingCents)} ({Math.round(data.micro.ratio * 100)} %)</span>
          </div>
          <Bar ratio={data.micro.ratio} level={data.micro.level} />
          <p className={cn('mt-1 text-xs', data.micro.level === 'ok' ? 'text-[var(--fg-muted)]' : 'font-medium')} style={data.micro.level === 'ok' ? undefined : { color: COLORS[data.micro.level] }}>
            {data.micro.level === 'ok' && `Il te reste ${formatEuros(data.micro.remaining)} avant le plafond.`}
            {data.micro.level === 'near' && `Tu approches du plafond : il te reste ${formatEuros(data.micro.remaining)}.`}
            {data.micro.level === 'over' && 'Plafond dépassé : vérifie ta situation (changement de régime) avec un comptable.'}
          </p>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>Seuil de franchise de TVA (majoré : {formatEuros(company.vatMajoredCents)})</span>
            <span className="tabular-nums">{formatEuros(data.collectedYear)} / {formatEuros(company.vatBaseCents)} ({Math.round(data.vat.base.ratio * 100)} %)</span>
          </div>
          <Bar ratio={data.vat.base.ratio} level={data.vat.level === 'over_majored' ? 'over' : data.vat.level === 'over_base' || data.vat.level === 'near' ? 'near' : 'ok'} />
          <p className="mt-1 text-xs" style={{ color: data.vat.level === 'ok' ? 'var(--fg-muted)' : data.vat.level === 'over_majored' ? COLORS.over : COLORS.near }}>
            {data.vat.level === 'ok' ? `Il te reste ${formatEuros(data.vat.base.remaining)} avant le seuil de base.` : VAT_TEXT[data.vat.level]}
          </p>
        </div>
      </Card>

      <Card title="Mes tarifs" className="mb-4">
        {services.filter((x) => !x.archived_at).length === 0 && <p className="text-sm text-[var(--fg-muted)]">Aucune prestation enregistrée.</p>}
        <div className="flex flex-wrap gap-3">
          {services.filter((x) => !x.archived_at).map((x) => (
            <div key={x.id} className="rounded border border-[var(--border)] px-3 py-2">
              <div className="text-sm text-[var(--fg-muted)]">{x.label}</div>
              <div className="text-lg font-semibold tabular-nums">{formatEuros(x.unit_price_cents)} <span className="text-sm font-normal text-[var(--fg-muted)]">/ {x.unit}</span></div>
            </div>
          ))}
        </div>
        <div className="mt-2"><Link onClick={() => show('services')}>Modifier mes prestations</Link></div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <Card title="Tâches du jour">
          {data.tasks.length === 0 && <p className="text-sm text-[var(--fg-muted)]">Aucune tâche pour aujourd'hui.</p>}
          {data.tasks.slice(0, 8).map((t) => (
            <button key={t.id} onClick={() => select(t.id)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-[var(--bg-hover)]">
              <span className="flex-1 truncate">{t.title}</span>
              <span className={cn('text-xs', t.overdue ? 'text-red-500' : 'text-[var(--fg-muted)]')}>{t.overdue ? `en retard (${formatDateFr(t.due)})` : "aujourd'hui"}</span>
            </button>
          ))}
          {data.tasks.length > 8 && <p className="mt-1 text-xs text-[var(--fg-muted)]">… et {data.tasks.length - 8} autres</p>}
        </Card>

        <Card title="Impayés">
          {data.receivable.length === 0 && <p className="text-sm text-[var(--fg-muted)]">Tout est payé.</p>}
          {data.receivable.slice(0, 5).map((r) => {
            const client = clients.find((c) => c.id === r.invoice.client_id)
            return (
              <button key={r.invoice.id} onClick={() => openInvoice(r.invoice.id)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-[var(--bg-hover)]">
                <span className="w-24 font-medium">{r.invoice.number}</span>
                <span className="flex-1 truncate">{client ? clientDisplayName(client) : ''}</span>
                <span className="tabular-nums">{formatEuros(r.remaining)}</span>
                <span className={cn('w-14 text-right text-xs', r.daysLate > 0 ? 'text-red-500' : 'text-[var(--fg-muted)]')}>{r.daysLate > 0 ? `${r.daysLate} j` : ''}</span>
              </button>
            )
          })}
          <div className="mt-2 flex items-center gap-3">
            <Link onClick={() => show('payments')}>Voir tous les paiements</Link>
            {toRemind > 0 && <span className="text-xs text-yellow-600">{toRemind} à relancer</span>}
          </div>
        </Card>
      </div>

      <Card title={`Encaissements ${year} par mois`}>
        <div className="flex h-28 items-end gap-2">
          {data.monthly.map((cents, i) => (
            <div key={i} className="flex flex-1 flex-col items-center justify-end" title={`${MONTHS[i]} : ${formatEuros(cents)}`}>
              <div className="w-full rounded-t bg-[var(--accent)] opacity-70" style={{ height: `${(cents / max) * 84}px`, minHeight: cents > 0 ? 2 : 0 }} />
              <div className="mt-1 text-[10px] text-[var(--fg-muted)]">{MONTHS[i]}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
