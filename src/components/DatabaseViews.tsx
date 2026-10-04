import { useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Plus, Trash2 } from 'lucide-react'
import {
  allColumns, canGroupBy, cellValue, groupRows, isoDate, monthGrid,
  type Column, type Group, type Schema, type ViewConfig,
} from '@/lib/database'
import { coverStyle } from '@/components/PagePickers'
import { Chip, PropertyEditor } from '@/components/PropertyEditor'
import { useApp } from '@/store/app'
import type { ObjectRow } from '@/lib/types'
import { Icon } from '@/components/Icon'

export interface ViewProps {
  db: ObjectRow
  schema: Schema
  view: ViewConfig
  rows: ObjectRow[]
  /** Enregistre un schéma modifié (ex. nouvelle option de choix). */
  change: (s: Schema) => void
  addOption: (colId: string, label: string) => string
  /** Entête de colonne du tableau (menu de gestion de la propriété). */
  renderHeader?: (col: Column) => React.ReactNode
}

const btn = 'flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-[var(--bg-hover)]'
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const DAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

function groupColumn(schema: Schema, view: ViewConfig): Column | undefined {
  return allColumns(schema).find((c) => c.id === view.groupBy && canGroupBy(c))
}

/** Petites pastilles : les propriétés de type choix d'une ligne. */
function ChoiceChips({ row, schema, skip }: { row: ObjectRow; schema: Schema; skip?: string }) {
  return (
    <>
      {schema.columns
        .filter((c) => (c.type === 'select' || c.type === 'multiselect') && c.id !== skip)
        .flatMap((c) => {
          const v = cellValue(row, c)
          const ids = Array.isArray(v) ? (v as string[]) : v ? [v as string] : []
          return ids.map((id) => c.options?.find((o) => o.id === id)).filter(Boolean)
        })
        .map((o) => <Chip key={o!.id} label={o!.label} color={o!.color} />)}
    </>
  )
}

function RowTitle({ row }: { row: ObjectRow }) {
  return (
    <span className="truncate">
      {row.icon && <Icon value={row.icon} size={16} className="mr-1 align-text-bottom" />}
      {row.title || 'Nouvelle page'}
    </span>
  )
}

export function TableView({ db, schema, view, rows, change, addOption, renderHeader }: ViewProps) {
  const { setCell, openPeek, trash } = useApp()
  const cols = allColumns(schema)
  const gcol = groupColumn(schema, view)
  const groups: Group[] = gcol
    ? groupRows(rows, gcol).filter((g) => g.rows.length > 0)
    : [{ id: 'all', label: '', value: null, rows }]

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {cols.map((c) => (
              <th key={c.id} className="min-w-[160px] border-r border-[var(--border)] p-0 text-left font-normal last:border-r-0">
                {renderHeader ? renderHeader(c) : <span className="block px-2 py-1.5 text-xs font-semibold text-[var(--fg-muted)]">{c.name}</span>}
              </th>
            ))}
            <th className="w-16" />
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.id}>
            {gcol && (
              <tr>
                <td colSpan={cols.length + 1} className="pb-1 pt-3">
                  {g.color ? <Chip label={g.label} color={g.color} /> : <span className="text-xs font-semibold">{g.label}</span>}
                  <span className="ml-1 text-xs text-[var(--fg-muted)]">{g.rows.length}</span>
                </td>
              </tr>
            )}
            {g.rows.map((row) => (
              <tr key={row.id} className="group border-b border-[var(--border)]">
                {cols.map((c) => (
                  <td key={c.id} className="border-r border-[var(--border)] p-0 align-top last:border-r-0">
                    <PropertyEditor
                      col={c}
                      value={cellValue(row, c)}
                      onChange={(v) => void setCell(row.id, c.id, v)}
                      onCreateOption={(label) => addOption(c.id, label)}
                    />
                  </td>
                ))}
                <td className="whitespace-nowrap px-1 text-right opacity-0 group-hover:opacity-100">
                  <button title="Ouvrir en aperçu" className="rounded p-1 hover:bg-[var(--bg-hover)]" onClick={() => openPeek(row.id)}><ExternalLink size={14} /></button>
                  <button title="Mettre à la corbeille" className="rounded p-1 hover:bg-[var(--bg-hover)]" onClick={() => void trash(row.id)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {rows.length === 0 && <p className="px-2 py-3 text-sm text-[var(--fg-muted)]">Aucune ligne à afficher.</p>}
      <NewRow db={db} change={change} schema={schema} />
    </div>
  )
}

function NewRow({ db }: { db: ObjectRow; schema: Schema; change: (s: Schema) => void }) {
  const createRow = useApp((s) => s.createRow)
  return (
    <button className={btn + ' mt-1 text-[var(--fg-muted)]'} onClick={() => void createRow(db.id)}>
      <Plus size={14} /> Nouvelle ligne
    </button>
  )
}

export function ListView({ db, schema, view, rows, change }: ViewProps) {
  const select = useApp((s) => s.select)
  const gcol = groupColumn(schema, view)
  const groups: Group[] = gcol
    ? groupRows(rows, gcol).filter((g) => g.rows.length > 0)
    : [{ id: 'all', label: '', value: null, rows }]
  return (
    <div>
      {groups.map((g) => (
        <div key={g.id} className="mb-3">
          {gcol && (
            <div className="mb-1">
              {g.color ? <Chip label={g.label} color={g.color} /> : <span className="text-xs font-semibold">{g.label}</span>}
              <span className="ml-1 text-xs text-[var(--fg-muted)]">{g.rows.length}</span>
            </div>
          )}
          {g.rows.map((row) => (
            <button key={row.id} onClick={() => select(row.id)} className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]">
              <RowTitle row={row} />
              <span className="ml-auto flex shrink-0 items-center"><ChoiceChips row={row} schema={schema} skip={gcol?.id} /></span>
            </button>
          ))}
        </div>
      ))}
      {rows.length === 0 && <p className="px-2 py-3 text-sm text-[var(--fg-muted)]">Aucune ligne à afficher.</p>}
      <NewRow db={db} schema={schema} change={change} />
    </div>
  )
}

export function GalleryView({ db, schema, rows, change }: ViewProps) {
  const select = useApp((s) => s.select)
  return (
    <div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {rows.map((row) => (
          <button key={row.id} onClick={() => select(row.id)} className="overflow-hidden rounded-md border border-[var(--border)] text-left hover:bg-[var(--bg-hover)]">
            <div
              className="flex h-28 items-center justify-center bg-[var(--bg-side)] text-4xl"
              style={row.cover ? coverStyle(row.cover) : undefined}
            >
              {!row.cover && <Icon value={row.icon} size={40} />}
            </div>
            <div className="p-2">
              <div className="truncate text-sm font-medium">{row.title || 'Nouvelle page'}</div>
              <div className="mt-1"><ChoiceChips row={row} schema={schema} /></div>
            </div>
          </button>
        ))}
      </div>
      {rows.length === 0 && <p className="px-2 py-3 text-sm text-[var(--fg-muted)]">Aucune ligne à afficher.</p>}
      <NewRow db={db} schema={schema} change={change} />
    </div>
  )
}

export function KanbanView({ db, schema, view, rows }: ViewProps) {
  const { setCell, createRow, select } = useApp()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const col = groupColumn(schema, view) ?? schema.columns.find((c) => c.type === 'select')
  if (!col || col.type !== 'select') {
    return <p className="px-2 py-3 text-sm text-[var(--fg-muted)]">Le kanban range les lignes selon une propriété « Choix unique » (par exemple État). Ajoute-en une avec « + Propriété ».</p>
  }
  const groups = groupRows(rows, col)

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {groups.map((g) => (
        <div
          key={g.id}
          onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(g.id) } }}
          onDragLeave={() => setOverId(null)}
          onDrop={(e) => {
            e.preventDefault()
            if (dragId) void setCell(dragId, col.id, g.value)
            setDragId(null)
            setOverId(null)
          }}
          className={'w-64 shrink-0 rounded-md bg-[var(--bg-side)] p-2 ' + (overId === g.id ? 'outline outline-2 outline-[var(--accent)]' : '')}
        >
          <div className="mb-2 flex items-center">
            {g.color ? <Chip label={g.label} color={g.color} /> : <span className="text-xs font-semibold">{g.label}</span>}
            <span className="ml-1 text-xs text-[var(--fg-muted)]">{g.rows.length}</span>
          </div>
          {g.rows.map((row) => (
            <div
              key={row.id}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData('text/plain', row.id); setDragId(row.id) }}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              onClick={() => select(row.id)}
              className="mb-2 cursor-pointer rounded border border-[var(--border)] bg-[var(--bg)] p-2 text-sm shadow-sm hover:bg-[var(--bg-hover)]"
            >
              <RowTitle row={row} />
              <div className="mt-1"><ChoiceChips row={row} schema={schema} skip={col.id} /></div>
            </div>
          ))}
          <button
            className={btn + ' w-full text-[var(--fg-muted)]'}
            onClick={() => void createRow(db.id, g.value === null ? undefined : { [col.id]: g.value })}
          >
            <Plus size={14} /> Nouvelle
          </button>
        </div>
      ))}
    </div>
  )
}

export function CalendarView({ db, schema, view, rows }: ViewProps) {
  const { createRow, select } = useApp()
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const col = allColumns(schema).find((c) => c.id === view.dateCol && c.type === 'date') ?? schema.columns.find((c) => c.type === 'date')
  if (!col) {
    return <p className="px-2 py-3 text-sm text-[var(--fg-muted)]">Le calendrier a besoin d'une propriété « Date ». Ajoute-en une avec « + Propriété ».</p>
  }
  const weeks = monthGrid(cursor.year, cursor.month)
  const byDate = new Map<string, ObjectRow[]>()
  const undated: ObjectRow[] = []
  for (const r of rows) {
    const d = cellValue(r, col)
    if (typeof d === 'string' && d) byDate.set(d, [...(byDate.get(d) ?? []), r])
    else undated.push(r)
  }
  const move = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }
  const todayIso = isoDate(today)

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <button className={btn} onClick={() => move(-1)} aria-label="Mois précédent"><ChevronLeft size={16} /></button>
        <div className="w-40 text-center font-semibold capitalize">{MONTHS[cursor.month]} {cursor.year}</div>
        <button className={btn} onClick={() => move(1)} aria-label="Mois suivant"><ChevronRight size={16} /></button>
        <button className={btn} onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}>Aujourd'hui</button>
        <span className="text-xs text-[var(--fg-muted)]">selon « {col.name} »</span>
      </div>
      <div className="grid grid-cols-7 border-l border-t border-[var(--border)] text-sm">
        {DAYS.map((d) => <div key={d} className="border-b border-r border-[var(--border)] px-1 py-1 text-center text-xs text-[var(--fg-muted)]">{d}</div>)}
        {weeks.flat().map((day) => (
          <div key={day.date} className={'group min-h-[96px] border-b border-r border-[var(--border)] p-1 ' + (day.inMonth ? '' : 'bg-[var(--bg-side)] text-[var(--fg-muted)]')}>
            <div className="flex items-center justify-between">
              <span className={day.date === todayIso ? 'rounded-full bg-[var(--accent)] px-1.5 text-xs text-white' : 'text-xs'}>{Number(day.date.slice(8))}</span>
              <button
                title="Ajouter une ligne ce jour-là"
                className="rounded px-1 opacity-0 hover:bg-[var(--bg-hover)] group-hover:opacity-100"
                onClick={() => void createRow(db.id, { [col.id]: day.date })}
              >
                +
              </button>
            </div>
            {(byDate.get(day.date) ?? []).map((r) => (
              <button key={r.id} onClick={() => select(r.id)} className="mt-0.5 block w-full truncate rounded bg-[var(--bg-hover)] px-1 py-0.5 text-left text-xs hover:underline">
                {r.title || 'Nouvelle page'}
              </button>
            ))}
          </div>
        ))}
      </div>
      {undated.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="mb-1 text-xs font-semibold text-[var(--fg-muted)]">Sans date ({undated.length})</div>
          {undated.map((r) => (
            <button key={r.id} onClick={() => select(r.id)} className="mr-2 rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-xs hover:underline">
              {r.title || 'Nouvelle page'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
