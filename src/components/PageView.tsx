import { useEffect, useRef, useState } from 'react'
import { Star, Trash2 } from 'lucide-react'
import { PageEditor } from '@/components/PageEditor'
import { CoverPicker, coverStyle, IconPicker } from '@/components/PagePickers'
import { useApp } from '@/store/app'

type Patch = Parameters<ReturnType<typeof useApp.getState>['update']>[1]

export function PageView() {
  const { objects, selectedId, update, trash, createPage, select } = useApp()
  const page = objects.find((o) => o.id === selectedId && !o.deleted_at)
  const [title, setTitle] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<{ id: string; patch: Patch } | null>(null)

  // On ne recharge le titre que lorsqu'on change de page, pas à chaque frappe.
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
        <button onClick={() => void createPage()} className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white">
          Créer une page
        </button>
      </div>
    )
  }

  // Enregistrement automatique 400 ms après la dernière frappe.
  const saveLater = (patch: Patch) => {
    // On cumule titre + contenu pour qu'une frappe n'annule jamais l'enregistrement de l'autre.
    pending.current = { id: page.id, patch: { ...(pending.current?.id === page.id ? pending.current.patch : {}), ...patch } }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const p = pending.current
      pending.current = null
      if (p) void update(p.id, p.patch)
    }, 400)
  }

  // Chemin de la page : Parent › Sous-parent
  const trail: string[] = []
  const seen = new Set<string>()
  for (let p = objects.find((o) => o.id === page.parent_id); p && !seen.has(p.id); p = objects.find((o) => o.id === p!.parent_id)) {
    seen.add(p.id)
    trail.unshift(p.id)
  }

  return (
    <div className="h-full overflow-y-auto">
      {page.cover && <div className="h-48 w-full" style={coverStyle(page.cover)} />}
      <div className="mx-auto max-w-3xl px-12 py-8">
        {trail.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1 text-xs text-[var(--fg-muted)]">
            {trail.map((id) => {
              const p = objects.find((o) => o.id === id)!
              return (
                <span key={id}>
                  <button className="hover:underline" onClick={() => select(id)}>{p.icon} {p.title || 'Sans titre'}</button> ›
                </span>
              )
            })}
          </div>
        )}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex gap-1 text-[var(--fg-muted)]">
            <IconPicker value={page.icon} onChange={(icon) => void update(page.id, { icon })} />
            <CoverPicker value={page.cover} onChange={(cover) => void update(page.id, { cover })} />
          </div>
          <div className="flex gap-1">
            <button
              title="Favori"
              onClick={() => void update(page.id, { is_favorite: page.is_favorite ? 0 : 1 })}
              className="rounded p-1.5 hover:bg-[var(--bg-hover)]"
            >
              <Star size={16} className={page.is_favorite ? 'fill-yellow-400 text-yellow-400' : 'text-[var(--fg-muted)]'} />
            </button>
            <button
              title="Mettre à la corbeille"
              onClick={() => void trash(page.id)}
              className="rounded p-1.5 hover:bg-[var(--bg-hover)]"
            >
              <Trash2 size={16} className="text-[var(--fg-muted)]" />
            </button>
          </div>
        </div>
        {page.icon && <div className="mb-1 text-6xl leading-tight">{page.icon}</div>}
        <input
          value={title}
          placeholder="Sans titre"
          onChange={(e) => {
            setTitle(e.target.value)
            saveLater({ title: e.target.value })
          }}
          className="w-full bg-transparent text-4xl font-bold outline-none placeholder:text-[var(--fg-muted)]"
        />
        <div className="-mx-12 mt-4">
          <PageEditor key={page.id} initial={page.content} onChange={(json) => saveLater({ content: json })} />
        </div>
      </div>
    </div>
  )
}
