import { useEffect, useRef, useState } from 'react'
import { Star, Trash2 } from 'lucide-react'
import { useApp } from '@/store/app'

function readText(content: string | null): string {
  if (!content) return ''
  try {
    return JSON.parse(content).text ?? ''
  } catch {
    return ''
  }
}

export function PageView() {
  const { objects, selectedId, update, trash, createPage } = useApp()
  const page = objects.find((o) => o.id === selectedId && !o.deleted_at)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const timer = useRef<number | undefined>(undefined)

  // On ne recharge les champs que lorsqu'on change de page, pas à chaque frappe.
  useEffect(() => {
    setTitle(page?.title ?? '')
    setText(readText(page?.content ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id])

  if (!page) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--fg-muted)]">
        <p>Aucune page sélectionnée.</p>
        <button onClick={createPage} className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white">
          Créer une page
        </button>
      </div>
    )
  }

  // Enregistrement automatique 400 ms après la dernière frappe.
  const saveLater = (patch: Parameters<typeof update>[1]) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void update(page.id, patch), 400)
  }

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto px-12 py-10">
      <div className="mb-2 flex justify-end gap-1">
        <button
          title="Favori"
          onClick={() => update(page.id, { is_favorite: page.is_favorite ? 0 : 1 })}
          className="rounded p-1.5 hover:bg-[var(--bg-hover)]"
        >
          <Star size={16} className={page.is_favorite ? 'fill-yellow-400 text-yellow-400' : 'text-[var(--fg-muted)]'} />
        </button>
        <button
          title="Mettre à la corbeille"
          onClick={() => trash(page.id)}
          className="rounded p-1.5 hover:bg-[var(--bg-hover)]"
        >
          <Trash2 size={16} className="text-[var(--fg-muted)]" />
        </button>
      </div>
      <input
        value={title}
        placeholder="Sans titre"
        onChange={(e) => {
          setTitle(e.target.value)
          saveLater({ title: e.target.value })
        }}
        className="w-full bg-transparent text-4xl font-bold outline-none placeholder:text-[var(--fg-muted)]"
      />
      <textarea
        value={text}
        placeholder="Écris ici… (l'éditeur de blocs façon Notion arrive en phase 1)"
        onChange={(e) => {
          setText(e.target.value)
          saveLater({ content: JSON.stringify({ text: e.target.value }) })
        }}
        className="mt-6 h-[60vh] w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-[var(--fg-muted)]"
      />
    </div>
  )
}
