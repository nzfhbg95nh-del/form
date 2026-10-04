import { useEffect } from 'react'
import { todayISO } from './backup'
import { notify } from './notify'
import { findDueTasks, pickUnsent, reminderText, type SentToday } from './reminders'
import { useApp } from '@/store/app'

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
        const due = findDueTasks(useApp.getState().objects, today)
        let previous: SentToday | null = null
        try {
          previous = JSON.parse((await repo.getSetting('reminders_sent')) ?? 'null')
        } catch {
          previous = null
        }
        const { fresh, sent } = pickUnsent(due, previous, today)
        if (fresh.length === 0) return
        const { title, body } = reminderText(fresh)
        // On ne note les tâches comme « rappelées » que si la notification est bien partie.
        if (await notify(title, body)) await repo.setSetting('reminders_sent', JSON.stringify(sent))
      } catch {
        /* un rappel raté ne doit jamais gêner l'app */
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
