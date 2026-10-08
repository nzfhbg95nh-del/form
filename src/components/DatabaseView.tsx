import { useEffect, useState } from 'react'
import { ArrowDownUp, Filter as FilterIcon, Plus, Settings2, Trash2, X } from 'lucide-react'
import {
  allColumns, applyView, canGroupBy, makeView, newId, needsValue, OPS_BY_TYPE, OPTION_COLORS, parseSchema, PROP_TYPES, VIEW_TYPES,
  type Column, type Filter, type PropType, type Schema, type ViewConfig, type ViewType,
} from '@/lib/database'
import { CalendarView, GalleryView, KanbanView, ListView, TableView } from '@/components/DatabaseViews'
import { IconPicker } from '@/components/PagePickers'
import { useApp } from '@/store/app'
import type { ObjectRow } from '@/lib/types'
import { Icon } from '@/components/Icon'
import { RecipesView } from '@/components/RecipesView'

const btn = 'flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-[var(--bg-hover)]'
const input = 'rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-sm outline-none'
/** Bouton qui ferme un panneau de filtres, de tris ou de réglages (les changements sont déjà appliqués). */
function ValidateButton({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-3 flex justify-end border-t border-[var(--border)] pt-2">
      <button className="rounded bg-[var(--accent)] px-4 py-1 text-sm text-white" onClick={onClose}>Valider</button>
    </div>
  )
}

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

function patchView(schema: Schema, id: string, patch: Partial<ViewConfig>): Schema {
  return { ...schema, views: schema.views.map((v) => (v.id === id ? { ...v, ...patch } : v)) }
}

function FilterPanel({ schema, view, onChange, onClose }: { schema: Schema; view: ViewConfig; onChange: (s: Schema) => void; onClose: () => void }) {
  const cols = allColumns(schema)
  const setFilters = (filters: Filter[]) => onChange(patchView(schema, view.id, { filters }))
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
      <button className={btn} onClick={() => setFilters([...view.filters, { id: newId(), colId: 'title', op: 'contains', value: '' }])}>
        <Plus size={14} /> Ajouter un filtre
      </button>
      <ValidateButton onClose={onClose} />
    </div>
  )
}

function SortPanel({ schema, view, onChange, onClose }: { schema: Schema; view: ViewConfig; onChange: (s: Schema) => void; onClose: () => void }) {
  const cols = allColumns(schema)
  const setSorts = (sorts: ViewConfig['sorts']) => onChange(patchView(schema, view.id, { sorts }))

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
      <ValidateButton onClose={onClose} />
    </div>
  )
}

/** Réglages de la vue active : nom, regroupement, propriété de date, suppression. */
function ViewSettings({ schema, view, onChange, onClose }: { schema: Schema; view: ViewConfig; onChange: (s: Schema) => void; onClose: () => void }) {
  const cols = allColumns(schema)
  const [name, setName] = useState(view.name)
  useEffect(() => setName(view.name), [view.id, view.name])
  const set = (p: Partial<ViewConfig>) => onChange(patchView(schema, view.id, p))
  const groupable = cols.filter(canGroupBy)
  const kanbanCols = cols.filter((c) => c.type === 'select')

  return (
    <div className={panel}>
      <label className="mb-1 block text-xs text-[var(--fg-muted)]">Nom de la vue</label>
      <input className={input + ' mb-3 w-full'} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && set({ name: name.trim() })} />

      {(view.type === 'table' || view.type === 'list') && (
        <>
          <label className="mb-1 block text-xs text-[var(--fg-muted)]">Regrouper par</label>
          <select className={input + ' mb-3 w-full'} value={view.groupBy ?? ''} onChange={(e) => set({ groupBy: e.target.value || undefined })}>
            <option value="">Pas de regroupement</option>
            {groupable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </>
      )}
      {view.type === 'kanban' && (
        <>
          <label className="mb-1 block text-xs text-[var(--fg-muted)]">Colonnes selon</label>
          <select className={input + ' mb-3 w-full'} value={view.groupBy ?? ''} onChange={(e) => set({ groupBy: e.target.value || undefined })}>
            <option value="">Automatique</option>
            {kanbanCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </>
      )}
      {view.type === 'calendar' && (
        <>
          <label className="mb-1 block text-xs text-[var(--fg-muted)]">Date utilisée</label>
          <select className={input + ' mb-3 w-full'} value={view.dateCol ?? ''} onChange={(e) => set({ dateCol: e.target.value || undefined })}>
            <option value="">Automatique</option>
            {cols.filter((c) => c.type === 'date').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </>
      )}
      {schema.views.length > 1 && (
        <button
          className={btn + ' text-red-500'}
          onClick={() => {
            if (window.confirm(`Supprimer la vue « ${view.name} » ? Les lignes ne sont pas supprimées.`)) {
              onChange({ ...schema, views: schema.views.filter((v) => v.id !== view.id) })
            }
          }}
        >
          <Trash2 size={14} /> Supprimer cette vue
        </button>
      )}
      <ValidateButton onClose={onClose} />
    </div>
  )
}

function ColumnMenu({ col, schema, objects, onChange }: { col: Column; schema: Schema; objects: ObjectRow[]; onChange: (s: Schema) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(col.name)
  useEffect(() => setName(col.name), [col.name])
  const setCol = (patch: Partial<Column>) => onChange({ ...schema, columns: schema.columns.map((c) => (c.id === col.id ? { ...c, ...patch } : c)) })
  const editable = col.id !== 'title'
  const target = objects.find((o) => o.id === col.targetDb)

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
                <p className="mb-2 text-xs text-[var(--fg-muted)]">
                  Type : {PROP_TYPES.find((t) => t.type === col.type)?.label.split(' (')[0]}
                  {col.type === 'relation' && ` → ${target ? target.title || 'Nouvelle page' : 'base introuvable'}`}
                </p>
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
                          groupBy: v.groupBy === col.id ? undefined : v.groupBy,
                          dateCol: v.dateCol === col.id ? undefined : v.dateCol,
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

function AddColumn({ db, schema, objects, onChange }: { db: ObjectRow; schema: Schema; objects: ObjectRow[]; onChange: (s: Schema) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<PropType>('text')
  const databases = objects.filter((o) => o.type === 'database' && !o.deleted_at)
  const [target, setTarget] = useState(db.id)
  const add = () => {
    const col: Column = { id: newId(), name: name.trim() || 'Propriété', type }
    if (type === 'select' || type === 'multiselect') col.options = []
    if (type === 'relation') col.targetDb = target
    onChange({ ...schema, columns: [...schema.columns, col] })
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
            {type === 'relation' && (
              <select className={input + ' mb-2 w-full'} value={target} onChange={(e) => setTarget(e.target.value)}>
                {databases.map((d) => <option key={d.id} value={d.id}>{d.title || 'Nouvelle page'}</option>)}
              </select>
            )}
            <button className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-white" onClick={add}>Ajouter</button>
          </div>
        </>
      )}
    </div>
  )
}

function AddView({ schema, onChange, onCreated }: { schema: Schema; onChange: (s: Schema) => void; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button className={btn} title="Ajouter une vue" onClick={() => setOpen(!open)}><Plus size={14} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={panel + ' min-w-[160px]'}>
            {VIEW_TYPES.map((t) => (
              <button
                key={t.type}
                className={btn + ' w-full'}
                onClick={() => {
                  const v = makeView(t.type as ViewType)
                  onChange({ ...schema, views: [...schema.views, v] })
                  onCreated(v.id)
                  setOpen(false)
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SyncMailButton() {
  const syncMail = useApp((s) => s.syncMail)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    let text: string
    try {
      const n = await syncMail()
      text = n === 0 ? 'Aucun nouveau courrier.' : `${n} nouveau${n > 1 ? 'x' : ''} courrier${n > 1 ? 's' : ''} !`
    } catch (e) {
      text = e instanceof Error ? e.message : String(e)
    }
    setBusy(false)
    useApp.setState({ toast: text })
    window.setTimeout(() => useApp.setState({ toast: null }), 4000)
  }
  return <button className={btn} disabled={busy} onClick={() => void run()}>📬 {busy ? 'Relève en cours…' : 'Relever le courrier'}</button>
}

/** La base « Recettes » a sa propre page (catégories puis galerie) ; les autres bases ont leurs vues habituelles. */
export function DatabaseView({ db, embedded = false }: { db: ObjectRow; embedded?: boolean }) {
  const schema = parseSchema(db.properties)
  if (schema.kind === 'recipes' && !embedded) return <RecipesView db={db} schema={schema} />
  return <DatabaseTable db={db} embedded={embedded} />
}

/** `embedded` : version intégrée dans une page (titre discret, pas de marges de page entière). */
function DatabaseTable({ db, embedded = false }: { db: ObjectRow; embedded?: boolean }) {
  const { objects, update, saveSchema } = useApp()
  const schema = parseSchema(db.properties)
  const storeKey = `form-view-${db.id}`
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(storeKey))
  const view = schema.views.find((v) => v.id === activeId) ?? schema.views[0]
  const [panelOpen, setPanelOpen] = useState<'filter' | 'sort' | 'settings' | null>(null)
  const [title, setTitle] = useState(db.title)
  useEffect(() => setTitle(db.title), [db.id, db.title])

  const rows = objects.filter((o) => o.type === 'row' && o.parent_id === db.id && !o.deleted_at)
  const shown = applyView(rows, schema, view)
  const change = (s: Schema) => void saveSchema(db.id, s)
  const pick = (id: string) => {
    setActiveId(id)
    setPanelOpen(null)
    try { localStorage.setItem(storeKey, id) } catch { /* sans importance */ }
  }
  const toggle = (p: 'filter' | 'sort' | 'settings') => setPanelOpen(panelOpen === p ? null : p)

  const viewProps = {
    db, schema, view, rows: shown, change,
    addOption: (colId: string, label: string) => {
      const r = addOption(schema, colId, label)
      change(r.schema)
      return r.optionId
    },
    renderHeader: (c: Column) => <ColumnMenu col={c} schema={schema} objects={objects} onChange={change} />,
  }

  return (
    <div className={embedded ? 'px-1 py-2' : 'h-full overflow-y-auto px-12 py-8'}>
      {embedded ? (
        <div className="mb-2 flex items-center gap-2">
          {db.icon && <Icon value={db.icon} size={20} />}
          <input
            value={title}
            placeholder="Base de données sans titre"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== db.title && void update(db.id, { title })}
            className="min-w-0 flex-1 bg-transparent py-0.5 text-lg font-semibold leading-snug outline-none placeholder:text-[var(--fg-muted)]"
          />
          <button type="button" className="shrink-0 rounded px-2 py-0.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]" onClick={() => useApp.getState().select(db.id)}>
            Ouvrir en pleine page ↗
          </button>
        </div>
      ) : (
        <>
          <div className="mb-1 flex items-center gap-2">
            {db.icon && <Icon value={db.icon} size={40} />}
            <IconPicker value={db.icon} onChange={(icon) => void update(db.id, { icon })} />
          </div>
          <input
            value={title}
            placeholder="Base de données sans titre"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== db.title && void update(db.id, { title })}
            className="mb-3 w-full bg-transparent py-1 text-4xl font-bold leading-[1.3] outline-none placeholder:text-[var(--fg-muted)]"
          />
        </>
      )}

      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        {schema.views.map((v) => (
          <button
            key={v.id}
            onClick={() => pick(v.id)}
            className={'border-b-2 px-2 py-1 text-sm ' + (v.id === view.id ? 'border-[var(--fg)] font-medium' : 'border-transparent text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]')}
          >
            {v.name}
          </button>
        ))}
        <AddView schema={schema} onChange={change} onCreated={pick} />
      </div>

      {panelOpen && <div className="fixed inset-0 z-10" onMouseDown={() => setPanelOpen(null)} />}
      <div className="mb-3 mt-2 flex items-center gap-1">
        <div className="relative">
          <button className={btn} onClick={() => toggle('filter')}>
            <FilterIcon size={14} /> Filtrer{view.filters.length > 0 && ` (${view.filters.length})`}
          </button>
          {panelOpen === 'filter' && <FilterPanel schema={schema} view={view} onChange={change} onClose={() => setPanelOpen(null)} />}
        </div>
        <div className="relative">
          <button className={btn} onClick={() => toggle('sort')}>
            <ArrowDownUp size={14} /> Trier{view.sorts.length > 0 && ` (${view.sorts.length})`}
          </button>
          {panelOpen === 'sort' && <SortPanel schema={schema} view={view} onChange={change} onClose={() => setPanelOpen(null)} />}
        </div>
        <div className="relative">
          <button className={btn} onClick={() => toggle('settings')}><Settings2 size={14} /> Réglages de la vue</button>
          {panelOpen === 'settings' && <ViewSettings schema={schema} view={view} onChange={change} onClose={() => setPanelOpen(null)} />}
        </div>
        <div className="flex-1" />
        {schema.kind === 'mail' && <SyncMailButton />}
        <AddColumn db={db} schema={schema} objects={objects} onChange={change} />
      </div>

      {view.type === 'table' && <TableView {...viewProps} />}
      {view.type === 'list' && <ListView {...viewProps} />}
      {view.type === 'kanban' && <KanbanView {...viewProps} />}
      {view.type === 'calendar' && <CalendarView {...viewProps} />}
      {view.type === 'gallery' && <GalleryView {...viewProps} />}
    </div>
  )
}
