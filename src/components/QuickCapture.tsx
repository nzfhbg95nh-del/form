import { useState } from 'react'
import { useApp } from '@/store/app'

export function QuickCapture() {
  const { saveCapture, setCapture } = useApp()
  const [text, setText] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]" onMouseDown={() => setCapture(false)}>
      <div
        className="w-[520px] max-w-[90vw] rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-sm font-semibold">Capture rapide</div>
        <textarea
          autoFocus
          value={text}
          placeholder="Une idée, un lien, une tâche… (la première ligne sera le titre)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setCapture(false)
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void saveCapture(text)
          }}
          className="h-32 w-full resize-none rounded border border-[var(--border)] bg-transparent p-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-[var(--fg-muted)]">Ctrl + Entrée pour enregistrer · Échap pour annuler</span>
          <button
            disabled={!text.trim()}
            onClick={() => void saveCapture(text)}
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
