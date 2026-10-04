import { useEffect, useState } from 'react'
import type { Column } from '@/lib/database'

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
    default:
      return <TextLike type={col.type as 'text' | 'number' | 'url'} value={value} onChange={onChange} />
  }
}
