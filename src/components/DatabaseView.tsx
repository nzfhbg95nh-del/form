import { useEffect, useState } from 'react'
import { ArrowDownUp, ExternalLink, Filter as FilterIcon, Plus, Trash2, X } from 'lucide-react'
import {
  allColumns, applyView, cellValue, newId, needsValue, OPS_BY_TYPE, OPTION_COLORS, parseSchema, PROP_TYPES,
  type Column, type Filter, type PropType, type Schema,
} from '@/lib/database'
import { IconPicker } from '@/components/PagePickers'
import { PropertyEditor } from '@/components/PropertyEditor'
import { useApp } from '@/store/app'
import type { ObjectRow } from '@/lib/types'

const btn = 'flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-[var(--bg-hover)]'
const input = 'rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-sm outline-none'
const panel = 'absolute left-0 z-20 mt-1 min-w-[320px] rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 shadow-lg'

/** Ajoute une option à une colonne de choix et renvoie son identifiant. */
export function addOption(schema: Schema, colId: string, label: string): { schema: Schema; optionId: string } {
  const optionId = newId()
  const columns = schema.columns.map((c) => {
    if (c.id !== colId) return c
    const options = c.options ?? []
    return { ...c, options: [...options, { id: optionId, label, color: OPTION_COLORS[options.length % OPTION_COLORS.length] }] }
  })
  return { schema: { ...schema, columns }, optionId }
}

function FilterPanel({ schema, onChange }: { schema: Schema; onChange: (s: Schema) => void }) {
  const view = schema.views[0]
  const cols = allColumns(schema)
  const setFilters = (filters: Filter[]) => onChange({ ...schema, views: [{ ...view, filters }, ...schema.views.slice(1)] })
  const patch = (id: string, p: Partial<Filter>) => setFilters(view.filters.map((f) => (f.id === id ? { ...f, ...p } : f)))

  return (
    <div className={panel}>
      {view.filters.length === 0 && <p className="mb-2 text-sm text-[var(--fg-muted)]">Aucun filtre.</p>}
      {view.filters.map((f) => {
        const col = cols.find((c) => c.id === f.colId) ?? cols[0]
        const ops = OPS_BY_TYPE[col.type]
        return (
          <div key={f.id} className="mb-2 flex items-center gap-1">
            <select
              className={input}
              value={col.id}
              onChange={(e) => {
                const c = cols.find((x) => x.id === e.target.value)!
                patch(f.id, { colId: c.id, op: OPS_BY_TYPE[c.type][0].op, value: '' })
              }}
            >
              {cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className={input} value={f.op} onChange={(e) => patch(f.id, { op: e.target.value as Filter['op'] })}>
              {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            {needsValue(f.op) &&
              (col.type === 'select' || col.type === 'multiselect' ? (
                <select className={input} value={f.value} onChange={(e) => patch(f.id, { value: e.target.value })}>
                  <option value="">—</option>
                  {(col.options ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  className={input + ' w-32'}
                  type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                  value={f.value}
                  onChange={(e) => patch(f.id, { value: e.target.value })}
                />
              ))}
            <button title="Supprimer le filtre" onClick={() => setFilters(view.filters.filter((x) => x.id !== f.id))}>
              <X size={14} />
            </button>
          </div>
        )
      })}
      <button
        className={btn}
        onClick={() => setFilters([...view.filters, { id: newId(), colId: 'title', op: 'contains', value: '' }])}
      >
        <Plus size={14} /> Ajouter un filtre
      </button>
    </div>
  )
}

function SortPanel({ schema, onChange }: { schema: Schema; onChange: (s: Schema) => void }) {
  const view = schema.views[0]
  const cols = allColumns(schema)
  const setSorts = (sorts: typeof view.sorts) => onChange({ ...schema, views: [{ ...view, sorts }, ...schema.views.slice(1)] })

  return (
    <div className={panel}>
      {view.sorts.length === 0 && <p className="mb-2 text-sm text-[var(--fg-muted)]">Aucun tri.</p>}
      {view.sorts.map((s, i) => (
        <div key={i} className="mb-2 flex items-center gap-1">
          <select className={input} value={s.colId} onChange={(e) => setSorts(view.sorts.map((x, j) => (j === i ? { ...x, colId: e.target.value } : x)))}>
            {cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={input} value={s.dir} onChange={(e) => setSorts(view.sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)))}>
            <option value="asc">croissant</option>
            <option value="desc">décroissant</option>
          </select>
          <button title="Supprimer le tri" onClick={() => setSorts(view.sorts.filter((_, j) => j !== i))}><X size={14} /></button>
        </div>
      ))}
      <button className={btn} onClick={() => setSorts([...view.sorts, { colId: 'title', dir: 'asc' }])}>
        <Plus size={14} /> Ajouter un tri
      </button>
    </div>
  )
}

function ColumnMenu({ col, schema, onChange }: { col: Column; schema: Schema; onChange: (s: Schema) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(col.name)
  useEffect(() => setName(col.name), [col.name])
  const setCol = (patch: Partial<Column>) => onChange({ ...schema, columns: schema.columns.map((c) => (c.id === col.id ? { ...c, ...patch } : c)) })
  const editable = col.id !== 'title'

  return (
    <div className="relative">
      <button className="w-full px-2 py-1.5 text-left text-xs font-semibold text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]" onClick={() => setOpen(!open)}>
        {col.name}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={panel + ' min-w-[260px]'}>
            {editable ? (
              <>
                <input
                  className={input + ' mb-2 w-full'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => name.trim() && setCol({ name: name.trim() })}
                />
                <p className="mb-2 text-xs text-[var(--fg-muted)]">Type : {PROP_TYPES.find((t) => t.type === col.type)?.label}</p>
                {(col.type === 'select' || col.type === 'multiselect') &&
                  (col.options ?? []).map((o) => (
                    <div key={o.id} className="mb-1 flex items-center gap-1">
                      <button
                        title="Changer la couleur"
                        className="h-5 w-5 rounded border border-[var(--border)]"
                        style={{ background: o.color }}
                        onClick={() => {
                          const next = OPTION_COLORS[(OPTION_COLORS.indexOf(o.color) + 1) % OPTION_COLORS.length]
                          setCol({ options: col.options!.map((x) => (x.id === o.id ? { ...x, color: next } : x)) })
                        }}
                      />
                      <input
                        className={input + ' flex-1'}
                        defaultValue={o.label}
                        onBlur={(e) => e.target.value.trim() && setCol({ options: col.options!.map((x) => (x.id === o.id ? { ...x, label: e.target.value.trim() } : x)) })}
                      />
                      <button title="Supprimer l'option" onClick={() => setCol({ options: col.options!.filter((x) => x.id !== o.id) })}><X size={14} /></button>
                    </div>
                  ))}
                <button
                  className={btn + ' mt-2 text-red-500'}
                  onClick={() => {
                    if (window.confirm(`Supprimer la propriété « ${col.name} » et ses valeurs ?`)) {
                      onChange({
                        columns: schema.columns.filter((c) => c.id !== col.id),
                        views: schema.views.map((v) => ({
                          ...v,
                          filters: v.filters.filter((f) => f.colId !== col.id),
                          sorts: v.sorts.filter((s) => s.colId !== col.id),
                        })),
                      })
                    }
                  }}
                >
                  <Trash2 size={14} /> Supprimer la propriété
                </button>
              </>
            ) : (
              <p className="text-sm text-[var(--fg-muted)]">Le nom de chaque ligne ne peut pas être supprimé.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function AddColumn({ schema, onChange }: { schema: Schema; onChange: (s: Schema) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<PropType>('text')
  const add = () => {
    onChange({ ...schema, columns: [...schema.columns, { id: newId(), name: name.trim() || 'Propriété', type, ...(type === 'select' || type === 'multiselect' ? { options: [] } : {}) }] })
    setName('')
    setOpen(false)
  }
  return (
    <div className="relative">
      <button className={btn} onClick={() => setOpen(!open)}><Plus size={14} /> Propriété</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={panel + ' right-0 left-auto min-w-[260px]'}>
            <input className={input + ' mb-2 w-full'} placeholder="Nom de la propriété" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <select className={input + ' mb-2 w-full'} value={type} onChange={(e) => setType(e.target.value as PropType)}>
              {PROP_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
            <button className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-white" onClick={add}>Ajouter</button>
          </div>
        </>
      )}
    </div>
  )
}

export function DatabaseView({ db }: { db: ObjectRow }) {
  const { objects, update, createRow, setCell, saveSchema, select, trash } = useApp()
  const schema = parseSchema(db.properties)
  const view = schema.views[0]
  const cols = allColumns(schema)
  const [panelOpen, setPanelOpen] = useState<'filter' | 'sort' | null>(null)
  const [title, setTitle] = useState(db.title)
  useEffect(() => setTitle(db.title), [db.id, db.title])

  const rows = objects.filter((o) => o.type === 'row' && o.parent_id === db.id && !o.deleted_at)
  const shown = applyView(rows, schema, view)
  const change = (s: Schema) => void saveSchema(db.id, s)

  return (
    <div className="h-full overflow-y-auto px-12 py-8">
      <div className="mb-1 flex items-center gap-2">
        {db.icon && <span className="text-4xl">{db.icon}</span>}
        <IconPicker value={db.icon} onChange={(icon) => void update(db.id, { icon })} />
      </div>
      <input
        value={title}
        placeholder="Base de données sans titre"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== db.title && void update(db.id, { title })}
        className="mb-4 w-full bg-transparent text-4xl font-bold outline-none placeholder:text-[var(--fg-muted)]"
      />

      <div className="mb-2 flex items-center gap-1 border-b border-[var(--border)] pb-2">
        <div className="relative">
          <button className={btn} onClick={() => setPanelOpen(panelOpen === 'filter' ? null : 'filter')}>
            <FilterIcon size={14} /> Filtrer{view.filters.length > 0 && ` (${view.filters.length})`}
          </button>
          {panelOpen === 'filter' && <FilterPanel schema={schema} onChange={change} />}
        </div>
        <div className="relative">
          <button className={btn} onClick={() => setPanelOpen(panelOpen === 'sort' ? null : 'sort')}>
            <ArrowDownUp size={14} /> Trier{view.sorts.length > 0 && ` (${view.sorts.length})`}
          </button>
          {panelOpen === 'sort' && <SortPanel schema={schema} onChange={change} />}
        </div>
        <div className="flex-1" />
        <AddColumn schema={schema} onChange={change} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {cols.map((c) => (
                <th key={c.id} className="min-w-[160px] border-r border-[var(--border)] p-0 text-left font-normal last:border-r-0">
                  <ColumnMenu col={c} schema={schema} onChange={change} />
                </th>
              ))}
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} className="group border-b border-[var(--border)]">
                {cols.map((c) => (
                  <td key={c.id} className="border-r border-[var(--border)] p-0 align-top last:border-r-0">
                    <PropertyEditor
                      col={c}
                      value={cellValue(row, c)}
                      onChange={(v) => void setCell(row.id, c.id, v)}
                      onCreateOption={(label) => {
                        const r = addOption(schema, c.id, label)
                        change(r.schema)
                        return r.optionId
                      }}
                    />
                  </td>
                ))}
                <td className="whitespace-nowrap px-1 text-right opacity-0 group-hover:opacity-100">
                  <button title="Ouvrir la page" className="rounded p-1 hover:bg-[var(--bg-hover)]" onClick={() => select(row.id)}><ExternalLink size={14} /></button>
                  <button title="Mettre à la corbeille" className="rounded p-1 hover:bg-[var(--bg-hover)]" onClick={() => void trash(row.id)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="px-2 py-3 text-sm text-[var(--fg-muted)]">
            {rows.length === 0 ? 'Aucune ligne.' : 'Aucune ligne ne correspond aux filtres.'}
          </p>
        )}
      </div>
      <button className={btn + ' mt-1 text-[var(--fg-muted)]'} onClick={() => void createRow(db.id)}>
        <Plus size={14} /> Nouvelle ligne
      </button>
    </div>
  )
}
