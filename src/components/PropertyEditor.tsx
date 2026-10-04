import { useEffect, useState } from 'react'
import { readFileAsDataUrl } from '@/lib/content'
import type { Column, FileValue } from '@/lib/database'
import { useApp } from '@/store/app'

const field = 'w-full rounded bg-transparent px-1.5 py-1 text-sm outline-none hover:bg-[var(--bg-hover)] focus:bg-[var(--bg-hover)]'

export function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="mr-1 inline-block rounded px-1.5 py-0.5 text-xs" style={{ background: color, color: '#37352f' }}>
      {label}
    </span>
  )
}

function TextLike({ type, value, onChange }: { type: 'text' | 'number' | 'url'; value: unknown; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState(value === undefined || value === null ? '' : String(value))
  useEffect(() => setDraft(value === undefined || value === null ? '' : String(value)), [value])
  const commit = () => {
    if (type === 'number') {
      const n = draft.trim() === '' ? null : Number(draft.replace(',', '.'))
      onChange(n === null || Number.isNaN(n) ? null : n)
    } else {
      onChange(draft)
    }
  }
  return (
    <input
      value={draft}
      inputMode={type === 'number' ? 'decimal' : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={field}
    />
  )
}

function OptionPicker({
  col, value, onChange, onCreateOption,
}: {
  col: Column
  value: unknown
  onChange: (v: unknown) => void
  onCreateOption: (label: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const multi = col.type === 'multiselect'
  const options = col.options ?? []
  const selected: string[] = multi ? (Array.isArray(value) ? (value as string[]) : []) : value ? [value as string] : []

  const toggle = (id: string) => {
    if (multi) onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
    else {
      onChange(selected[0] === id ? null : id)
      setOpen(false)
    }
  }
  const create = () => {
    const label = text.trim()
    if (!label) return
    const existing = options.find((o) => o.label.toLowerCase() === label.toLowerCase())
    toggle(existing ? existing.id : onCreateOption(label))
    setText('')
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={field + ' min-h-[28px] text-left'}>
        {selected.length === 0 && <span className="text-[var(--fg-muted)]">Vide</span>}
        {selected.map((id) => {
          const o = options.find((x) => x.id === id)
          return o ? <Chip key={id} label={o.label} color={o.color} /> : null
        })}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-56 rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 shadow-lg">
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => toggle(o.id)}
                className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left hover:bg-[var(--bg-hover)]"
              >
                <Chip label={o.label} color={o.color} />
                {selected.includes(o.id) && <span>✓</span>}
              </button>
            ))}
            <input
              autoFocus
              value={text}
              placeholder="Créer une option…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create() }}
              className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-sm outline-none"
            />
          </div>
        </>
      )}
    </div>
  )
}

const MAX_FILE = 10 * 1024 * 1024

function RelationPicker({ col, value, onChange }: { col: Column; value: unknown; onChange: (v: unknown) => void }) {
  const objects = useApp((s) => s.objects)
  const select = useApp((s) => s.select)
  const [open, setOpen] = useState(false)
  const targets = objects.filter((o) => o.type === 'row' && o.parent_id === col.targetDb && !o.deleted_at)
  const selected: string[] = Array.isArray(value) ? (value as string[]) : []
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])

  if (!col.targetDb) return <div className="px-1.5 py-1 text-sm text-[var(--fg-muted)]">Base liée non définie</div>
  return (
    <div className="relative">
      <div className="flex min-h-[28px] flex-wrap items-center gap-1 px-1.5 py-1">
        {selected.map((id) => {
          const t = objects.find((o) => o.id === id)
          return t && !t.deleted_at ? (
            <button key={id} onClick={() => select(id)} className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-xs hover:underline">
              {t.title || 'Nouvelle page'}
            </button>
          ) : null
        })}
        <button onClick={() => setOpen(!open)} className="rounded px-1 text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]">
          {selected.length === 0 ? 'Choisir…' : '+'}
        </button>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 shadow-lg">
            {targets.length === 0 && <p className="text-sm text-[var(--fg-muted)]">La base liée n'a aucune ligne.</p>}
            {targets.map((t) => (
              <button key={t.id} onClick={() => toggle(t.id)} className="flex w-full justify-between rounded px-1.5 py-1 text-left text-sm hover:bg-[var(--bg-hover)]">
                <span className="truncate">{t.title || 'Nouvelle page'}</span>
                {selected.includes(t.id) && <span>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FilePicker({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const files: FileValue[] = Array.isArray(value) ? (value as FileValue[]) : []
  const [message, setMessage] = useState<string | null>(null)
  return (
    <div className="px-1.5 py-1 text-sm">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-1">
          <a href={f.data} download={f.name} className="truncate text-[var(--accent)] hover:underline">{f.name}</a>
          <button title="Retirer le fichier" className="text-[var(--fg-muted)]" onClick={() => onChange(files.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <label className="cursor-pointer text-xs text-[var(--fg-muted)] hover:underline">
        + Ajouter un fichier
        <input
          type="file"
          multiple
          hidden
          onChange={async (e) => {
            const added: FileValue[] = []
            setMessage(null)
            for (const f of Array.from(e.target.files ?? [])) {
              if (f.size > MAX_FILE) setMessage(`« ${f.name} » dépasse 10 Mo : non ajouté.`)
              else added.push({ name: f.name, data: await readFileAsDataUrl(f) })
            }
            if (added.length > 0) onChange([...files, ...added])
            e.target.value = ''
          }}
        />
      </label>
      {message && <p className="text-xs text-red-500">{message}</p>}
    </div>
  )
}

export function PropertyEditor({
  col, value, onChange, onCreateOption,
}: {
  col: Column
  value: unknown
  onChange: (v: unknown) => void
  onCreateOption: (label: string) => string
}) {
  switch (col.type) {
    case 'checkbox':
      return (
        <div className="px-1.5 py-1">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        </div>
      )
    case 'date':
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={field}
        />
      )
    case 'select':
    case 'multiselect':
      return <OptionPicker col={col} value={value} onChange={onChange} onCreateOption={onCreateOption} />
    case 'relation':
      return <RelationPicker col={col} value={value} onChange={onChange} />
    case 'file':
      return <FilePicker value={value} onChange={onChange} />
    default:
      return <TextLike type={col.type as 'text' | 'number' | 'url'} value={value} onChange={onChange} />
  }
}
