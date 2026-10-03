import { useRef, useState } from 'react'
import { readFileAsDataUrl } from '@/lib/content'

const EMOJIS = [
  '📄', '📝', '📌', '📎', '📁', '📚', '💡', '🎨', '🖌️', '🖼️', '📷', '🎬',
  '🎯', '✅', '⭐', '🔥', '🚀', '💼', '🧾', '💶', '📅', '⏰', '🍳', '🥗',
  '🏠', '✈️', '🌍', '🌿', '🎵', '💻', '🛠️', '🧪', '❤️', '😀', '🤔', '👀',
]

export const COVERS = [
  'linear-gradient(135deg, #f6d365, #fda085)',
  'linear-gradient(135deg, #84fab0, #8fd3f4)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #434343, #000000)',
  '#e8d5c4',
  '#c9d6df',
  '#d4e2d4',
]

export function coverStyle(cover: string): React.CSSProperties {
  return cover.startsWith('data:')
    ? { backgroundImage: `url(${cover})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: cover }
}

const pop = 'absolute z-20 mt-1 rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 shadow-lg'
const btn = 'rounded px-2 py-1 text-sm hover:bg-[var(--bg-hover)]'

export function IconPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button className={btn} onClick={() => setOpen(!open)}>
        {value ? 'Changer l’icône' : '☺ Ajouter une icône'}
      </button>
      {open && (
        <div className={pop} style={{ width: 280 }}>
          <div className="grid grid-cols-6 gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                className="rounded p-1 text-xl hover:bg-[var(--bg-hover)]"
                onClick={() => { onChange(e); setOpen(false) }}
              >
                {e}
              </button>
            ))}
          </div>
          {value && (
            <button className={btn + ' mt-2 text-red-500'} onClick={() => { onChange(null); setOpen(false) }}>
              Retirer l’icône
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function CoverPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  return (
    <div className="relative inline-block">
      <button className={btn} onClick={() => setOpen(!open)}>
        {value ? 'Changer la couverture' : '🖼 Ajouter une couverture'}
      </button>
      {open && (
        <div className={pop} style={{ width: 280 }}>
          <div className="grid grid-cols-4 gap-2">
            {COVERS.map((c) => (
              <button
                key={c}
                aria-label="Choisir cette couverture"
                className="h-10 rounded border border-[var(--border)]"
                style={coverStyle(c)}
                onClick={() => { onChange(c); setOpen(false) }}
              />
            ))}
          </div>
          <button className={btn + ' mt-2'} onClick={() => file.current?.click()}>Importer une image…</button>
          {value && (
            <button className={btn + ' text-red-500'} onClick={() => { onChange(null); setOpen(false) }}>
              Retirer la couverture
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) { onChange(await readFileAsDataUrl(f)); setOpen(false) }
            }}
          />
        </div>
      )}
    </div>
  )
}
