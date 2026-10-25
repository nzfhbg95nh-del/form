import { useEffect, useRef, useState } from 'react'

/** Un champ pour donner un nom (Entrée = valider, Échap = annuler). */
export function NameInput({ initial = '', placeholder, confirmLabel = 'OK', onSubmit, onCancel, className = '' }: {
  initial?: string
  placeholder: string
  confirmLabel?: string
  onSubmit: (name: string) => void
  onCancel: () => void
  className?: string
}) {
  const [value, setValue] = useState(initial)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  const submit = () => {
    if (value.trim()) onSubmit(value.trim())
  }
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <input
        ref={input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
        aria-label={placeholder}
      />
      <button className="btn" disabled={!value.trim()} onClick={submit}>{confirmLabel}</button>
      <button className="btn" onClick={onCancel}>Annuler</button>
    </div>
  )
}
