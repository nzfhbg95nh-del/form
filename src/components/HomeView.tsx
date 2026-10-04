import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Clock, Database, Columns2, GripVertical, Maximize2, Plus, SlidersHorizontal, Star, StickyNote, Wallet, X } from 'lucide-react'
import { Icon } from '@/components/Icon'
import { todayISO } from '@/lib/backup'
import { formatEuros } from '@/lib/business'
import { collectedForMonth, collectedForYear, pendingQuotes, yearMonthOf } from '@/lib/dashboard'
import {
  addWidget, databaseRows, favoritePages, greeting, moveWidget, parseWidgets, recentPages, removeWidget, reorderWidget, serializeWidgets, toggleHalf, WIDGET_TYPES,
  type Widget, type WidgetType,
} from '@/lib/home'
import { lastEditText, displayTitle } from '@/lib/lastEdit'
import { isoDate, monthGrid, parseSchema } from '@/lib/database'
import { collectEvents, groupByDate, KIND_LABELS, shiftIso, upcomingByDate, weekDays, type CalendarEvent, type CalendarKind } from '@/lib/homeCalendar'
import { receivables } from '@/lib/payments'
import { formatDateFr } from '@/lib/quotes'
import { findDueTasks } from '@/lib/reminders'
import type { ObjectRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

const SETTING = 'home_widgets'

const WIDGET_ICON: Record<WidgetType, React.ReactNode> = {
  recents: <Clock size={14} />,
  favorites: <Star size={14} />,
  summary: <Wallet size={14} />,
  tasks: <CheckSquare size={14} />,
  note: <StickyNote size={14} />,
  database: <Database size={14} />,
  calendar: <CalendarDays size={14} />,
}

function PageCard({ page }: { page: ObjectRow }) {
  const select = useApp((s) => s.select)
  return (
    <button
      onClick={() => select(page.id)}
      className="flex h-28 w-40 shrink-0 flex-col justify-between rounded-lg border border-[var(--border)] p-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
    >
      <Icon value={page.icon ?? (page.type === 'database' ? '📊' : page.type === 'moodboard' ? '🖼️' : '📄')} size={28} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{displayTitle(page.title)}</div>
        <div className="truncate text-xs text-[var(--fg-muted)]">{lastEditText(page.updated_at)}</div>
      </div>
    </button>
  )
}

function QuickNote({ id }: { id: string }) {
  const repo = useApp((s) => s.repo)
  const [text, setText] = useState('')
  const [ready, setReady] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    void repo?.getSetting(`home_note_${id}`).then((v) => {
      setText(v ?? '')
      setReady(true)
    })
  }, [repo, id])
  return (
    <textarea
      value={text}
      disabled={!ready}
      placeholder="Écris ici : une idée, une liste, un rappel…"
      onChange={(e) => {
        setText(e.target.value)
        window.clearTimeout(timer.current)
        const value = e.target.value
        timer.current = window.setTimeout(() => void repo?.setSetting(`home_note_${id}`, value), 400)
      }}
      className="min-h-32 w-full resize-y rounded-lg border border-[var(--border)] bg-transparent p-3 text-sm outline-none focus:border-[var(--accent)]"
    />
  )
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const KIND_DOT: Record<CalendarKind, string> = { event: '#10b981', task: '#e0a100', row: 'var(--accent)', invoice: '#dc2626', quote: '#8b5cf6' }
const MODE_KEY = 'form-home-calendar-mode'
type CalMode = 'month' | 'week' | 'agenda'
const MODES: { id: CalMode; label: string }[] = [{ id: 'month', label: 'Mois' }, { id: 'week', label: 'Semaine' }, { id: 'agenda', label: 'Agenda' }]

const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

/** Calendrier : vue Mois, Semaine ou Agenda (liste compacte des prochaines dates prévues). Un clic sur un jour permet d'y ajouter une tâche. */
function CalendarWidget() {
  const { objects, invoices, quotes, select, show, addTasksFromAi, addCalendarEvent } = useApp()
  const todayIso = isoDate(new Date())
  const [mode, setMode] = useState<CalMode>(() => {
    try {
      const m = localStorage.getItem(MODE_KEY)
      return m === 'week' || m === 'agenda' ? m : 'month'
    } catch {
      return 'month'
    }
  })
  const [day, setDay] = useState<string>(todayIso)
  const [cursor, setCursor] = useState({ year: Number(todayIso.slice(0, 4)), month: Number(todayIso.slice(5, 7)) - 1 })
  const [draft, setDraft] = useState('')
  const [addKind, setAddKind] = useState<'event' | 'task'>('event')
  const events = useMemo(() => collectEvents(objects, invoices, quotes), [objects, invoices, quotes])
  const byDate = useMemo(() => groupByDate(events), [events])
  const tasksDb = objects.find((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'tasks')

  const pickMode = (m: CalMode) => {
    setMode(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* sans importance */ }
  }
  const goTo = (iso: string) => {
    setDay(iso)
    setCursor({ year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 })
  }
  const step = (delta: number) => {
    if (mode === 'week') return goTo(shiftIso(day, delta * 7))
    const d = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }
  const open = (e: CalendarEvent) => (e.open.to === 'object' ? select(e.open.id) : show(e.open.to))
  const addTask = () => {
    const title = draft.trim()
    if (!title) return
    const target = mode === 'agenda' ? todayIso : day
    const done = addKind === 'event' ? addCalendarEvent(title, target) : addTasksFromAi([{ title, due: target, priority: null }], tasksDb?.id ?? null, false)
    void done.then(() => setDraft(''))
  }

  const nav = 'rounded p-1 hover:bg-[var(--bg-hover)]'
  const week = weekDays(day)
  const title = mode === 'week'
    ? `${shortDay(week[0])} – ${shortDay(week[6])}`
    : `${MONTHS[cursor.month]} ${cursor.year}`
  const eventButton = (e: CalendarEvent, compact = false) => (
    <button key={e.id} onClick={() => open(e)} title={`${KIND_LABELS[e.kind]} : ${e.title}`} className={cn('flex w-full items-center gap-1.5 rounded text-left hover:bg-[var(--bg-hover)]', compact ? 'px-1 py-0.5 text-xs' : 'px-2 py-1.5 text-sm')}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_DOT[e.kind] }} />
      <span className="flex-1 truncate">{e.title}</span>
      {!compact && <span className="text-xs text-[var(--fg-muted)]">{KIND_LABELS[e.kind]}</span>}
    </button>
  )
  const adder = (
    <div className="mt-2 flex flex-wrap gap-2">
      <div className="flex rounded border border-[var(--border)] p-0.5" role="group" aria-label="Type d’élément à ajouter">
        {([['event', 'Événement'], ['task', 'Tâche']] as const).map(([id, label]) => (
          <button key={id} aria-pressed={addKind === id} onClick={() => setAddKind(id)} className={cn('rounded px-2 py-0.5 text-xs', addKind === id ? 'bg-[var(--bg-hover)] font-medium' : 'text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]')}>{label}</button>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') addTask() }}
        placeholder={`${addKind === 'event' ? 'Nouvel événement' : 'Nouvelle tâche'} ${mode === 'agenda' ? 'aujourd’hui' : `le ${shortDay(day)}`}…`}
        className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
      />
      <button onClick={addTask} disabled={!draft.trim()} className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-white disabled:opacity-40">Ajouter</button>
    </div>
  )

  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {mode !== 'agenda' && (
          <>
            <button className={nav} onClick={() => step(-1)} aria-label={mode === 'week' ? 'Semaine précédente' : 'Mois précédent'}><ChevronLeft size={16} /></button>
            <div className="min-w-44 text-center text-sm font-semibold capitalize">{title}</div>
            <button className={nav} onClick={() => step(1)} aria-label={mode === 'week' ? 'Semaine suivante' : 'Mois suivant'}><ChevronRight size={16} /></button>
            <button className="ml-1 rounded px-2 py-0.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]" onClick={() => goTo(todayIso)}>Aujourd’hui</button>
          </>
        )}
        {mode === 'agenda' && <div className="text-sm font-semibold">À venir</div>}
        <div className="flex-1" />
        <div className="flex rounded border border-[var(--border)] p-0.5" role="group" aria-label="Affichage du calendrier">
          {MODES.map((m) => (
            <button key={m.id} aria-pressed={mode === m.id} onClick={() => pickMode(m.id)} className={cn('rounded px-2 py-0.5 text-xs', mode === m.id ? 'bg-[var(--bg-hover)] font-medium' : 'text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]')}>{m.label}</button>
          ))}
        </div>
      </div>

      {mode === 'month' && (
        <>
          <div className="grid grid-cols-7 text-center text-xs text-[var(--fg-muted)]">
            {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {monthGrid(cursor.year, cursor.month).flat().map((c) => {
              const list = byDate.get(c.date) ?? []
              const kinds = [...new Set(list.map((e) => e.kind))]
              return (
                <button
                  key={c.date}
                  aria-label={`${c.date}${list.length ? `, ${list.length} événement${list.length > 1 ? 's' : ''}` : ''}`}
                  aria-pressed={c.date === day}
                  onClick={() => goTo(c.date)}
                  className={cn('flex h-11 flex-col items-center justify-center gap-0.5 rounded text-sm hover:bg-[var(--bg-hover)]', !c.inMonth && 'text-[var(--fg-muted)] opacity-50', c.date === day && 'bg-[var(--bg-hover)] ring-1 ring-[var(--accent)]')}
                >
                  <span className={cn(c.date === todayIso && 'rounded-full bg-[var(--accent)] px-1.5 text-white')}>{Number(c.date.slice(8))}</span>
                  <span className="flex h-1.5 gap-0.5">{kinds.map((k) => <span key={k} className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_DOT[k] }} />)}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 border-t border-[var(--border)] pt-2">
            <div className="mb-1 text-xs font-medium capitalize text-[var(--fg-muted)]">{shortDay(day)}</div>
            {(byDate.get(day) ?? []).length === 0 && <p className="text-sm text-[var(--fg-muted)]">Rien de prévu ce jour-là.</p>}
            {(byDate.get(day) ?? []).map((e) => eventButton(e))}
            {adder}
          </div>
        </>
      )}

      {mode === 'week' && (
        <>
          <div className="grid grid-cols-7 gap-1">
            {week.map((d) => (
              <div key={d} className={cn('min-h-32 rounded border p-1', d === day ? 'border-[var(--accent)] bg-[var(--bg-hover)]' : 'border-[var(--border)]')}>
                <button onClick={() => setDay(d)} aria-pressed={d === day} aria-label={d} className="mb-1 flex w-full items-center justify-center gap-1 text-xs capitalize text-[var(--fg-muted)] hover:text-[var(--fg)]">
                  {new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' })}
                  <span className={cn('text-sm', d === todayIso ? 'rounded-full bg-[var(--accent)] px-1.5 text-white' : 'text-[var(--fg)]')}>{Number(d.slice(8))}</span>
                </button>
                {(byDate.get(d) ?? []).map((e) => eventButton(e, true))}
              </div>
            ))}
          </div>
          {adder}
        </>
      )}

      {mode === 'agenda' && (
        <>
          {upcomingByDate(events, todayIso).length === 0 && <p className="py-2 text-sm text-[var(--fg-muted)]">Rien de prévu pour le moment.</p>}
          {upcomingByDate(events, todayIso).map((g) => (
            <div key={g.date} className="py-1">
              <div className="text-xs font-medium capitalize text-[var(--fg-muted)]">{g.date === todayIso ? `Aujourd’hui · ${shortDay(g.date)}` : shortDay(g.date)}</div>
              {g.events.map((e) => eventButton(e))}
            </div>
          ))}
          {adder}
        </>
      )}
    </div>
  )
}

function WidgetBody({ widget }: { widget: Widget }) {
  const { objects, payments, invoices, invoiceLines, quotes, quoteLines, select, show } = useApp()
  const today = todayISO()
  const { year, month } = yearMonthOf(today)
  const none = (text: string) => <p className="text-sm text-[var(--fg-muted)]">{text}</p>

  if (widget.type === 'recents') {
    const pages = recentPages(objects, 8)
    return pages.length === 0 ? none('Aucune page pour le moment.') : <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">{pages.map((p) => <PageCard key={p.id} page={p} />)}</div>
  }
  if (widget.type === 'favorites') {
    const pages = favoritePages(objects)
    return pages.length === 0 ? none('Clique sur l’étoile en haut d’une page pour l’ajouter ici.') : <div className="flex flex-wrap gap-3">{pages.map((p) => <PageCard key={p.id} page={p} />)}</div>
  }
  if (widget.type === 'summary') {
    const due = receivables(invoices, invoiceLines, payments, today).reduce((s, r) => s + r.remaining, 0)
    const waiting = pendingQuotes(quotes, quoteLines)
    const cells: { label: string; value: string; hint?: string; view: 'payments' | 'invoices' | 'quotes' }[] = [
      { label: 'Encaissé ce mois-ci', value: formatEuros(collectedForMonth(payments, year, month)), view: 'payments' },
      { label: `Encaissé en ${year}`, value: formatEuros(collectedForYear(payments, year)), view: 'payments' },
      { label: 'À encaisser', value: formatEuros(due), view: 'invoices' },
      { label: 'Devis en attente', value: String(waiting.waiting), hint: waiting.waiting > 0 ? formatEuros(waiting.waitingCents) : undefined, view: 'quotes' },
    ]
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map((c) => (
          <button key={c.label} onClick={() => show(c.view)} className="rounded-lg border border-[var(--border)] p-3 text-left hover:bg-[var(--bg-hover)]">
            <div className="text-xs text-[var(--fg-muted)]">{c.label}</div>
            <div className="text-xl font-semibold tabular-nums">{c.value}</div>
            {c.hint && <div className="text-xs text-[var(--fg-muted)]">{c.hint}</div>}
          </button>
        ))}
      </div>
    )
  }
  if (widget.type === 'tasks') {
    const tasks = findDueTasks(objects, today)
    return tasks.length === 0
      ? none('Aucune tâche pour aujourd’hui.')
      : (
        <div>
          {tasks.slice(0, 8).map((t) => (
            <button key={t.id} onClick={() => select(t.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]">
              <span className="flex-1 truncate">{t.title}</span>
              <span className={cn('text-xs', t.overdue ? 'text-red-500' : 'text-[var(--fg-muted)]')}>{t.overdue ? `en retard (${formatDateFr(t.due)})` : 'aujourd’hui'}</span>
            </button>
          ))}
        </div>
      )
  }
  if (widget.type === 'note') return <QuickNote id={widget.id} />
  if (widget.type === 'calendar') return <CalendarWidget />
  // Base de données épinglée
  const db = objects.find((o) => o.id === widget.dbId && o.type === 'database' && !o.deleted_at)
  if (!db) return none('Cette base de données n’existe plus : retire ce widget.')
  const rows = databaseRows(objects, db.id, 8)
  return (
    <div>
      <button onClick={() => select(db.id)} className="mb-1 flex items-center gap-2 rounded px-2 py-1 text-sm font-medium hover:bg-[var(--bg-hover)]">
        <Icon value={db.icon ?? '📊'} size={16} />{displayTitle(db.title)} <span className="text-xs font-normal text-[var(--fg-muted)]">Ouvrir ↗</span>
      </button>
      {rows.length === 0 && none('Cette base est vide.')}
      {rows.map((r) => (
        <button key={r.id} onClick={() => select(r.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]">
          <span className="flex-1 truncate">{displayTitle(r.title)}</span>
          <span className="text-xs text-[var(--fg-muted)]">{lastEditText(r.updated_at)}</span>
        </button>
      ))}
    </div>
  )
}

/** Page d'accueil : un bonjour, puis des widgets que l'on peut ajouter, retirer et réordonner. */
export function HomeView() {
  const { repo, objects } = useApp()
  const [widgets, setWidgets] = useState<Widget[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [pickDb, setPickDb] = useState(false)
  const [drag, setDrag] = useState<{ id: string; over: { id: string; place: 'before' | 'after' } | null } | null>(null)
  const latest = useRef<Widget[]>([])

  useEffect(() => {
    void repo?.getSetting(SETTING).then((raw) => setWidgets(parseWidgets(raw)))
  }, [repo])

  const databases = useMemo(() => objects.filter((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind !== 'mail'), [objects])
  if (!widgets) return null
  latest.current = widgets

  const save = (next: Widget[]) => {
    setWidgets(next)
    void repo?.setSetting(SETTING, serializeWidgets(next))
  }
  const add = (type: WidgetType, dbId?: string) => {
    save(addWidget(widgets, type, dbId))
    setAdding(false)
    setPickDb(false)
  }
  // Glisser-déposer à la souris (sans le glisser-déposer du navigateur, plus fiable) : on suit le pointeur, on repère le widget survolé.
  const startDrag = (e: React.PointerEvent, id: string) => {
    e.preventDefault()
    let over: { id: string; place: 'before' | 'after' } | null = null
    setDrag({ id, over: null })
    const move = (ev: PointerEvent) => {
      const target = [...document.querySelectorAll<HTMLElement>('[data-widget]')].find((el) => {
        const r = el.getBoundingClientRect()
        return el.dataset.widget !== id && ev.clientX >= r.left - 12 && ev.clientX <= r.right + 12 && ev.clientY >= r.top - 16 && ev.clientY <= r.bottom + 16
      })
      if (!target) over = null
      else {
        const r = target.getBoundingClientRect()
        const place = target.dataset.half === '1' ? (ev.clientX < r.left + r.width / 2 ? 'before' : 'after') : ev.clientY < r.top + r.height / 2 ? 'before' : 'after'
        over = { id: target.dataset.widget!, place }
      }
      setDrag({ id, over })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (over) save(reorderWidget(latest.current, id, over.id, over.place))
      setDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const now = new Date()
  const btn = 'flex items-center gap-1.5 rounded px-2 py-1 text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]'

  return (
    <div className="mx-auto max-w-4xl px-12 py-10">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold">{greeting(now.getHours())}</h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">{now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <button className={btn} onClick={() => { setEditing(!editing); setAdding(false) }}>
          <SlidersHorizontal size={14} /> {editing ? 'Terminer' : 'Personnaliser'}
        </button>
      </div>

      {widgets.length === 0 && <p className="mb-6 text-sm text-[var(--fg-muted)]">Ton accueil est vide. Clique sur « Personnaliser » puis « Ajouter un widget ».</p>}

      <div className="flex flex-wrap gap-x-6">
        {widgets.map((w, i) => {
          const meta = WIDGET_TYPES.find((t) => t.type === w.type)!
          const over = drag?.over?.id === w.id ? drag.over.place : null
          const bar = w.half ? 'before:-left-3 before:top-0 before:bottom-0 before:w-0.5' : 'before:-top-4 before:left-0 before:right-0 before:h-0.5'
          const barAfter = w.half ? 'after:-right-3 after:top-0 after:bottom-0 after:w-0.5' : 'after:-bottom-4 after:left-0 after:right-0 after:h-0.5'
          return (
            <section
              key={w.id}
              data-widget={w.id}
              data-half={w.half ? '1' : '0'}
              className={cn(
                'relative mb-8 min-w-0 rounded',
                w.half ? 'w-[calc(50%-12px)]' : 'w-full',
                drag?.id === w.id && 'opacity-40',
                over === 'before' && `before:absolute before:bg-[var(--accent)] ${bar}`,
                over === 'after' && `after:absolute after:bg-[var(--accent)] ${barAfter}`,
              )}
            >
              <div className="mb-2 flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                {editing && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Glisser pour déplacer"
                    title="Glisser pour déplacer"
                    onPointerDown={(e) => startDrag(e, w.id)}
                    className="-ml-5 cursor-grab touch-none select-none rounded p-0.5 hover:bg-[var(--bg-hover)] active:cursor-grabbing"
                  >
                    <GripVertical size={14} />
                  </span>
                )}
                {WIDGET_ICON[w.type]}
                <h2 className="flex-1 font-medium">{meta.label}</h2>
                {editing && (
                  <div className="flex gap-0.5">
                    <button className="rounded p-1 hover:bg-[var(--bg-hover)]" title={w.half ? 'Pleine largeur' : 'Demi-largeur (à côté d’un autre widget)'} aria-label={w.half ? 'Pleine largeur' : 'Demi-largeur'} onClick={() => save(toggleHalf(widgets, w.id))}>{w.half ? <Maximize2 size={14} /> : <Columns2 size={14} />}</button>
                    <button className="rounded p-1 hover:bg-[var(--bg-hover)] disabled:opacity-30" disabled={i === 0} title="Monter" aria-label="Monter" onClick={() => save(moveWidget(widgets, w.id, -1))}><ArrowUp size={14} /></button>
                    <button className="rounded p-1 hover:bg-[var(--bg-hover)] disabled:opacity-30" disabled={i === widgets.length - 1} title="Descendre" aria-label="Descendre" onClick={() => save(moveWidget(widgets, w.id, 1))}><ArrowDown size={14} /></button>
                    <button className="rounded p-1 text-red-500 hover:bg-[var(--bg-hover)]" title="Retirer ce widget" aria-label="Retirer ce widget" onClick={() => save(removeWidget(widgets, w.id))}><X size={14} /></button>
                  </div>
                )}
              </div>
              <WidgetBody widget={w} />
            </section>
          )
        })}
      </div>

      {editing && (
        <div className="relative">
          <button className={btn + ' border border-dashed border-[var(--border)]'} onClick={() => { setAdding(!adding); setPickDb(false) }}>
            <Plus size={14} /> Ajouter un widget
          </button>
          {adding && (
            <div className="absolute left-0 z-20 mt-1 w-80 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-xl" role="menu">
              {!pickDb && WIDGET_TYPES.map((t) => (
                <button
                  key={t.type}
                  className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
                  onClick={() => (t.type === 'database' ? setPickDb(true) : add(t.type))}
                >
                  <span className="text-[var(--fg-muted)]">{WIDGET_ICON[t.type]}</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm">{t.label}</span><span className="block truncate text-xs text-[var(--fg-muted)]">{t.help}</span></span>
                </button>
              ))}
              {pickDb && (
                <>
                  <div className="px-2 py-1 text-xs font-medium text-[var(--fg-muted)]">Quelle base de données ?</div>
                  {databases.length === 0 && <div className="px-2 py-2 text-sm text-[var(--fg-muted)]">Tu n’as pas encore de base de données.</div>}
                  {databases.map((d) => (
                    <button key={d.id} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]" onClick={() => add('database', d.id)}>
                      <Icon value={d.icon ?? '📊'} size={16} />{displayTitle(d.title)}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
