import { useEffect } from 'react'
import { todayISO } from './backup'
import { notify } from './notify'
import { receivables, toChase } from './payments'
import { findDueTasks, pickUnsent, reminderText, type Reminder, type SentToday } from './reminders'
import type { Repo } from './types'
import { useApp } from '@/store/app'

async function readSent(repo: Repo, key: string): Promise<SentToday | null> {
  try {
    return JSON.parse((await repo.getSetting(key)) ?? 'null')
  } catch {
    return null
  }
}

/** Tâches dont l'échéance est arrivée. */
async function checkTasks(repo: Repo, today: string) {
  const due = findDueTasks(useApp.getState().objects, today)
  const { fresh, sent } = pickUnsent(due, await readSent(repo, 'reminders_sent'), today)
  if (fresh.length === 0) return
  const { title, body } = reminderText(fresh)
  // On ne note les tâches comme « rappelées » que si la notification est bien partie.
  if (await notify(title, body)) await repo.setSetting('reminders_sent', JSON.stringify(sent))
}

/** Factures impayées à relancer (échéance + quelques jours). La relance elle-même reste manuelle. */
async function checkInvoices(repo: Repo, today: string) {
  const { invoices, invoiceLines, payments, company } = useApp.getState()
  const chase = toChase(receivables(invoices, invoiceLines, payments, today), company.reminderAfterDays)
  const asReminders: Reminder[] = chase.map((r) => ({ id: r.invoice.id, title: `${r.invoice.number} (${r.daysLate} j)`, due: r.invoice.due_date, overdue: true }))
  const { fresh, sent } = pickUnsent(asReminders, await readSent(repo, 'chase_sent'), today)
  if (fresh.length === 0) return
  const title = fresh.length === 1 ? 'Une facture à relancer' : `${fresh.length} factures à relancer`
  const shown = fresh.slice(0, 3).map((r) => r.title).join(', ')
  if (await notify(title, `${shown}${fresh.length > 3 ? ` et ${fresh.length - 3} autre${fresh.length - 3 > 1 ? 's' : ''}` : ''}. Ouvre « Paiements » pour préparer le message.`)) {
    await repo.setSetting('chase_sent', JSON.stringify(sent))
  }
}

/** Vérifie les échéances au démarrage, toutes les 30 minutes et quand la fenêtre revient au premier plan. */
export function useReminders() {
  const repo = useApp((s) => s.repo)

  useEffect(() => {
    if (!repo) return
    let busy = false

    const check = async () => {
      if (busy) return
      busy = true
      try {
        if ((await repo.getSetting('reminders_enabled')) === '0') return
        const today = todayISO()
        for (const job of [checkTasks, checkInvoices]) {
          try {
            await job(repo, today)
          } catch {
            /* un rappel raté ne doit jamais gêner l'app */
          }
        }
      } finally {
        busy = false
      }
    }

    void check()
    const timer = window.setInterval(() => void check(), 30 * 60 * 1000)
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [repo])
}
