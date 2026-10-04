import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Clock, Database, GripVertical, Plus, SlidersHorizontal, Star, StickyNote, Wallet, X } from 'lucide-react'
import { Icon } from '@/components/Icon'
import { todayISO } from '@/lib/backup'
import { formatEuros } from '@/lib/business'
import { collectedForMonth, collectedForYear, pendingQuotes, yearMonthOf } from '@/lib/dashboard'
import {
  addWidget, databaseRows, favoritePages, greeting, moveWidget, parseWidgets, recentPages, removeWidget, reorderWidget, serializeWidgets, WIDGET_TYPES,
  type Widget, type WidgetType,
} from '@/lib/home'
import { lastEditText, displayTitle } from '@/lib/lastEdit'
import { isoDate, monthGrid, parseSchema } from '@/lib/database'
import { collectEvents, groupByDate, KIND_LABELS, type CalendarEvent, type CalendarKind } from '@/lib/homeCalendar'
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
const KIND_DOT: Record<CalendarKind, string> = { task: '#e0a100', row: 'var(--accent)', invoice: '#dc2626', quote: '#8b5cf6' }

/** Calendrier du mois : un point par type d'événement ; un clic sur un jour liste ses événements. */
function CalendarWidget() {
  const { objects, invoices, quotes, select, show } = useApp()
  const today = new Date()
  const todayIso = isoDate(today)
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [day, setDay] = useState<string>(todayIso)
  const byDate = useMemo(() => groupByDate(collectEvents(objects, invoices, quotes)), [objects, invoices, quotes])
  const weeks = monthGrid(cursor.year, cursor.month)
  const move = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }
  const open = (e: CalendarEvent) => (e.open.to === 'object' ? select(e.open.id) : show(e.open.to))
  const selected = byDate.get(day) ?? []
  const nav = 'rounded p-1 hover:bg-[var(--bg-hover)]'

  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <div className="mb-2 flex items-center gap-1">
        <button className={nav} onClick={() => move(-1)} aria-label="Mois précédent"><ChevronLeft size={16} /></button>
        <div className="w-44 text-center text-sm font-semibold capitalize">{MONTHS[cursor.month]} {cursor.year}</div>
        <button className={nav} onClick={() => move(1)} aria-label="Mois suivant"><ChevronRight size={16} /></button>
        <button className="ml-2 rounded px-2 py-0.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]" onClick={() => { setCursor({ year: today.getFullYear(), month: today.getMonth() }); setDay(todayIso) }}>Aujourd’hui</button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-[var(--fg-muted)]">
        {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((c) => {
          const events = byDate.get(c.date) ?? []
          const kinds = [...new Set(events.map((e) => e.kind))]
          return (
            <button
              key={c.date}
              aria-label={`${c.date}${events.length ? `, ${events.length} événement${events.length > 1 ? 's' : ''}` : ''}`}
              onClick={() => setDay(c.date)}
              className={cn(
                'flex h-11 flex-col items-center justify-center gap-0.5 rounded text-sm hover:bg-[var(--bg-hover)]',
                !c.inMonth && 'text-[var(--fg-muted)] opacity-50',
                c.date === day && 'ring-1 ring-[var(--accent)]',
              )}
            >
              <span className={cn(c.date === todayIso && 'rounded-full bg-[var(--accent)] px-1.5 text-white')}>{Number(c.date.slice(8))}</span>
              <span className="flex h-1.5 gap-0.5">{kinds.map((k) => <span key={k} className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_DOT[k] }} />)}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-3 border-t border-[var(--border)] pt-2">
        <div className="mb-1 text-xs font-medium text-[var(--fg-muted)]">{formatDateFr(day)}</div>
        {selected.length === 0 && <p className="text-sm text-[var(--fg-muted)]">Rien de prévu ce jour-là.</p>}
        {selected.map((e) => (
          <button key={e.id} onClick={() => open(e)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_DOT[e.kind] }} />
            <span className="flex-1 truncate">{e.title}</span>
            <span className="text-xs text-[var(--fg-muted)]">{KIND_LABELS[e.kind]}</span>
          </button>
        ))}
      </div>
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
  const [drag, setDrag] = useState<{ id: string | null; over: { id: string; place: 'before' | 'after' } | null }>({ id: null, over: null })

  useEffect(() => {
    void repo?.getSetting(SETTING).then((raw) => setWidgets(parseWidgets(raw)))
  }, [repo])

  const databases = useMemo(() => objects.filter((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind !== 'mail'), [objects])
  if (!widgets) return null

  const save = (next: Widget[]) => {
    setWidgets(next)
    void repo?.setSetting(SETTING, serializeWidgets(next))
  }
  const add = (type: WidgetType, dbId?: string) => {
    save(addWidget(widgets, type, dbId))
    setAdding(false)
    setPickDb(false)
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

      {widgets.map((w, i) => {
        const meta = WIDGET_TYPES.find((t) => t.type === w.type)!
        return (
          <section
            key={w.id}
            data-widget={w.id}
            draggable={editing}
            onDragStart={(e) => {
              if (!editing) return
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', w.id)
              setDrag({ id: w.id, over: null })
            }}
            onDragOver={(e) => {
              if (!drag.id || drag.id === w.id) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              const place = e.clientY < r.top + r.height / 2 ? 'before' : 'after'
              if (drag.over?.id !== w.id || drag.over.place !== place) setDrag({ id: drag.id, over: { id: w.id, place } })
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (drag.id && drag.over) save(reorderWidget(widgets, drag.id, drag.over.id, drag.over.place))
              setDrag({ id: null, over: null })
            }}
            onDragEnd={() => setDrag({ id: null, over: null })}
            className={cn(
              'relative mb-8 rounded',
              drag.id === w.id && 'opacity-40',
              drag.over?.id === w.id && drag.over.place === 'before' && 'before:absolute before:-top-4 before:left-0 before:right-0 before:h-0.5 before:bg-[var(--accent)]',
              drag.over?.id === w.id && drag.over.place === 'after' && 'after:absolute after:-bottom-4 after:left-0 after:right-0 after:h-0.5 after:bg-[var(--accent)]',
            )}
          >
            <div className="mb-2 flex items-center gap-2 text-sm text-[var(--fg-muted)]">
              {editing && <GripVertical size={14} className="-ml-5 cursor-grab" aria-label="Glisser pour déplacer" />}
              {WIDGET_ICON[w.type]}
              <h2 className="flex-1 font-medium">{meta.label}</h2>
              {editing && (
                <div className="flex gap-0.5">
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
