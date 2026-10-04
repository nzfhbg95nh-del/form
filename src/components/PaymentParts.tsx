import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { centsToInput, clientDisplayName, formatEuros, parseEuros } from '@/lib/business'
import { todayISO } from '@/lib/backup'
import { fillTemplate, mailtoLink, METHOD_LABELS, newPayment, reminderVars, type Receivable } from '@/lib/payments'
import { formatDateFr } from '@/lib/quotes'
import { isTauri } from '@/lib/repo'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import type { Invoice, Payment, PaymentMethod } from '@/lib/types'

const field = 'w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]'
const primary = 'rounded bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-40'
const secondary = 'rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40'

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-[8vh]" onMouseDown={onClose}>
      <div
        className={cn('rounded-lg border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl', wide ? 'w-[680px]' : 'w-[460px]', 'max-w-[92vw]')}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2 className="mb-4 text-xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-[var(--fg-muted)]">{label}</span>
      {children}
    </label>
  )
}

/** Fenêtre « Enregistrer un paiement ». */
export function PaymentForm({ invoice, remaining, onClose }: { invoice: Invoice; remaining: number; onClose: () => void }) {
  const addPayment = useApp((s) => s.addPayment)
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState(centsToInput(remaining))
  const [method, setMethod] = useState<PaymentMethod>('transfer')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cents = parseEuros(amount)
  const tooMuch = cents !== null && cents > remaining
  const valid = cents !== null && cents > 0 && !tooMuch && date !== ''

  const save = async () => {
    if (!valid || cents === null) return
    try {
      await addPayment({ ...newPayment(invoice.id, date, cents), method, note })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal title={`Encaisser ${invoice.number ?? ''}`} onClose={onClose}>
      <p className="mb-3 text-sm text-[var(--fg-muted)]">Reste à payer : <strong>{formatEuros(remaining)}</strong></p>
      <div className="grid grid-cols-2 gap-x-4">
        <Row label="Date de réception"><input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} /></Row>
        <Row label="Montant reçu (€)">
          <input className={field + (cents === null || tooMuch ? ' border-red-500' : '')} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Row>
      </div>
      {tooMuch && <p className="mb-2 text-xs text-red-500">Le montant dépasse le reste à payer ({formatEuros(remaining)}).</p>}
      <Row label="Moyen de paiement">
        <select className={field} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
        </select>
      </Row>
      <Row label="Note (facultatif)"><input className={field} value={note} onChange={(e) => setNote(e.target.value)} /></Row>
      {error && <div className="mb-3 text-sm text-red-500">{error}</div>}
      <div className="flex gap-2">
        <button className={primary} disabled={!valid} onClick={() => void save()}>Enregistrer le paiement</button>
        <button className={secondary} onClick={onClose}>Annuler</button>
      </div>
    </Modal>
  )
}

/** Liste des paiements d'une facture (dans l'éditeur de facture). */
export function InvoicePayments({ invoice, remaining }: { invoice: Invoice; remaining: number }) {
  const { payments, deletePayment } = useApp()
  const [adding, setAdding] = useState(false)
  const mine = payments.filter((p) => p.invoice_id === invoice.id)
  const del = (p: Payment) => {
    if (window.confirm(`Supprimer ce paiement de ${formatEuros(p.amount_cents)} ? L'opération sera inscrite au journal.`)) void deletePayment(p.id)
  }

  return (
    <div className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">Paiements</h2>
      {mine.length === 0 && <p className="mb-2 text-sm text-[var(--fg-muted)]">Aucun paiement enregistré.</p>}
      {mine.map((p) => (
        <div key={p.id} className="flex items-center gap-3 border-b border-[var(--border)] py-1.5 text-sm">
          <span className="w-24">{formatDateFr(p.paid_on)}</span>
          <span className="w-28 tabular-nums">{formatEuros(p.amount_cents)}</span>
          <span className="w-32">{METHOD_LABELS[p.method]}</span>
          <span className="flex-1 text-[var(--fg-muted)]">{p.note}</span>
          <button title="Supprimer le paiement" onClick={() => del(p)} className="rounded p-1 text-red-500 hover:bg-[var(--bg-hover)]"><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="mt-2 flex items-center gap-3 text-sm">
        <span>Reste à payer : <strong>{formatEuros(remaining)}</strong></span>
        {remaining > 0 && <button className={secondary} onClick={() => setAdding(true)}>Enregistrer un paiement</button>}
      </div>
      {adding && <PaymentForm invoice={invoice} remaining={remaining} onClose={() => setAdding(false)} />}
    </div>
  )
}

/** Préparation d'un e-mail de relance : rien ne part sans que tu l'envoies toi-même. */
export function ReminderModal({ item, onClose }: { item: Receivable; onClose: () => void }) {
  const { clients, company, repo } = useApp()
  const client = clients.find((c) => c.id === item.invoice.client_id)
  const vars = reminderVars(item, client, company)
  const [to, setTo] = useState(client?.email ?? '')
  const [subject, setSubject] = useState(fillTemplate(company.reminderSubject, vars))
  const [body, setBody] = useState(fillTemplate(company.reminderBody, vars))
  const [message, setMessage] = useState<string | null>(null)

  const log = (detail: string) => repo?.logAudit({ entity: 'invoice', entityId: item.invoice.id, number: item.invoice.number, action: 'reminder', detail })

  const openMail = async () => {
    const link = mailtoLink(to, subject, body)
    try {
      if (isTauri()) await (await import('@tauri-apps/plugin-opener')).openUrl(link)
      else window.location.href = link
      await log(`Relance préparée dans la messagerie (${to || 'sans destinataire'})`)
      setMessage('Ta messagerie s’ouvre avec le message prêt : relis-le et envoie-le toi-même.')
    } catch (e) {
      setMessage(`Impossible d'ouvrir la messagerie (${e instanceof Error ? e.message : String(e)}). Utilise « Copier le message ».`)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Objet : ${subject}\n\n${body}`)
      await log('Texte de relance copié')
      setMessage('Message copié : colle-le dans ton e-mail.')
    } catch {
      setMessage("La copie a échoué : sélectionne le texte à la main.")
    }
  }

  return (
    <Modal title={`Relancer ${client ? clientDisplayName(client) : ''}`} onClose={onClose} wide>
      <p className="mb-3 text-sm text-[var(--fg-muted)]">
        Facture {item.invoice.number} — {formatEuros(item.remaining)} — échue le {formatDateFr(item.invoice.due_date)} ({item.daysLate} jour{item.daysLate > 1 ? 's' : ''} de retard).
        Rien n'est envoyé automatiquement : tu relis le message et tu l'envoies toi-même.
      </p>
      <Row label="Destinataire"><input className={field} value={to} placeholder="adresse e-mail du client" onChange={(e) => setTo(e.target.value)} /></Row>
      <Row label="Objet"><input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} /></Row>
      <Row label="Message"><textarea className={field + ' h-56 text-xs'} value={body} onChange={(e) => setBody(e.target.value)} /></Row>
      {message && <p className="mb-3 text-sm">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={primary} onClick={() => void openMail()}>Ouvrir dans ma messagerie</button>
        <button className={secondary} onClick={() => void copy()}>Copier le message</button>
        <button className={secondary} onClick={onClose}>Fermer</button>
      </div>
      <p className="mt-3 text-xs text-[var(--fg-muted)]">Le texte type se modifie dans Réglages &gt; Entreprise &gt; Relances. Pense à joindre le PDF de la facture.</p>
    </Modal>
  )
}
