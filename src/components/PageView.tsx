import { useEffect, useRef, useState } from 'react'
import { Star, Trash2 } from 'lucide-react'
import { PageEditor } from '@/components/PageEditor'
import { useApp } from '@/store/app'

export function PageView() {
  const { objects, selectedId, update, trash, createPage } = useApp()
  const page = objects.find((o) => o.id === selectedId && !o.deleted_at)
  const [title, setTitle] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<{ id: string; patch: Parameters<typeof update>[1] } | null>(null)

  // On ne recharge les champs que lorsqu'on change de page, pas à chaque frappe.
  useEffect(() => {
    // Si on quitte une page pendant les 400 ms d'attente, on enregistre tout de suite.
    const p = pending.current
    if (p && p.id !== page?.id) {
      window.clearTimeout(timer.current)
      pending.current = null
      void update(p.id, p.patch)
    }
    setTitle(page?.title ?? '')
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
    // On cumule titre + contenu pour qu'une frappe n'annule jamais l'enregistrement de l'autre.
    pending.current = { id: page.id, patch: { ...(pending.current?.id === page.id ? pending.current.patch : {}), ...patch } }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const p = pending.current
      pending.current = null
      if (p) void update(p.id, p.patch)
    }, 400)
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
      <div className="mt-4 -mx-12">
        <PageEditor
          key={page.id}
          initial={page.content}
          onChange={(json) => saveLater({ content: json })}
        />
      </div>
    </div>
  )
}
