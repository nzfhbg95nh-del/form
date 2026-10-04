import { useEffect, useRef, useState } from 'react'
import type { BlockNoteEditor } from '@blocknote/core'
import { Star, Trash2 } from 'lucide-react'
import { addOption } from '@/components/DatabaseView'
import { PropertyEditor } from '@/components/PropertyEditor'
import { allColumns, cellValue, parseSchema } from '@/lib/database'
import { PageEditor } from '@/components/PageEditor'
import { CoverPicker, coverStyle, IconPicker } from '@/components/PagePickers'
import { useApp } from '@/store/app'
import { Icon } from '@/components/Icon'

type Patch = Parameters<ReturnType<typeof useApp.getState>['update']>[1]

export function PageView({ pageId }: { pageId?: string }) {
  const { objects, selectedId, update, trash, createPage, select, setCell, saveSchema } = useApp()
  const page = objects.find((o) => o.id === (pageId ?? selectedId) && !o.deleted_at)
  const [title, setTitle] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const editorRef = useRef<BlockNoteEditor<never, never, never> | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [lit, setLit] = useState<{ left: number; top: number; width: number; height: number }[]>([])
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

  // Sélection par rectangle, comme dans Notion : on part d'une zone vide (marge, entre deux blocs) et on glisse.
  // Les blocs touchés sont surlignés, puis sélectionnés dans l'éditeur (Suppr, copier, déplacer… fonctionnent ensuite).
  const blocksIn = (r: { x1: number; y1: number; x2: number; y2: number }) => {
    const left = Math.min(r.x1, r.x2), right = Math.max(r.x1, r.x2), top = Math.min(r.y1, r.y2), bottom = Math.max(r.y1, r.y2)
    const hit: HTMLElement[] = []
    scroller.current?.querySelectorAll<HTMLElement>('.bn-block-outer').forEach((outer) => {
      const content = outer.querySelector<HTMLElement>(':scope > .bn-block > .bn-block-content')
      if (!content) return
      const b = content.getBoundingClientRect()
      if (b.left < right && b.right > left && b.top < bottom && b.bottom > top) hit.push(outer)
    })
    return hit
  }
  // Le surlignage est dessiné par-dessus (l'éditeur réécrit lui-même ses éléments, on ne peut pas y poser de marque).
  const mark = (hit: HTMLElement[]) => {
    setLit(hit.map((el) => {
      const b = (el.querySelector(':scope > .bn-block > .bn-block-content') ?? el).getBoundingClientRect()
      return { left: b.left - 4, top: b.top - 1, width: b.width + 8, height: b.height + 2 }
    }))
  }
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (e.button !== 0 || t.closest('button, input, textarea, select, a, img, [data-ui], .bn-side-menu, .bn-formatting-toolbar, [role="menu"], [role="dialog"], .bn-block-content, .bn-inline-content')) return
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return
    d.moved = true
    const r = { x1: d.x, y1: d.y, x2: e.clientX, y2: e.clientY }
    setMarquee(r)
    mark(blocksIn(r))
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* déjà relâché */ }
    if (!d?.moved) return
    const hit = blocksIn({ x1: d.x, y1: d.y, x2: e.clientX, y2: e.clientY })
    mark([])
    setMarquee(null)
    const editor = editorRef.current
    if (!editor || hit.length === 0) return
    const ids = hit.map((el) => el.getAttribute('data-id')).filter((id): id is string => !!id)
    try {
      editor.focus()
      editor.setSelection(ids[0] as never, ids[ids.length - 1] as never)
    } catch { /* sélection impossible : le surlignage disparaît simplement */ }
  }

  return (
    <div
      ref={scroller}
      className="h-full overflow-y-auto"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {lit.map((b, i) => (
        <div key={i} className="pointer-events-none fixed z-20 rounded bg-[#4da3ff]/20" style={b} />
      ))}
      {marquee && (
        <div
          className="pointer-events-none fixed z-30 border border-[#4da3ff] bg-[#4da3ff]/15"
          style={{ left: Math.min(marquee.x1, marquee.x2), top: Math.min(marquee.y1, marquee.y2), width: Math.abs(marquee.x2 - marquee.x1), height: Math.abs(marquee.y2 - marquee.y1) }}
        />
      )}
      {page.cover && <div className="h-48 w-full" style={coverStyle(page.cover)} />}
      <div className="mx-auto max-w-3xl px-12 py-8">
        {trail.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1 text-xs text-[var(--fg-muted)]">
            {trail.map((id) => {
              const p = objects.find((o) => o.id === id)!
              return (
                <span key={id}>
                  <button className="hover:underline" onClick={() => select(id)}><Icon value={p.icon} size={14} className="mr-1 align-text-bottom" />{p.title || 'Sans titre'}</button> ›
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
        {page.icon && <div className="mb-2"><Icon value={page.icon} size={64} /></div>}
        <input
          value={title}
          placeholder="Sans titre"
          onChange={(e) => {
            setTitle(e.target.value)
            saveLater({ title: e.target.value })
          }}
          className="w-full bg-transparent text-4xl font-bold outline-none placeholder:text-[var(--fg-muted)]"
        />
        {page.type === 'row' && (() => {
          const db = objects.find((o) => o.id === page.parent_id)
          if (!db) return null
          const schema = parseSchema(db.properties)
          return (
            <div className="mt-4 border-b border-[var(--border)] pb-3">
              {allColumns(schema).filter((c) => c.id !== 'title').map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <div className="w-40 shrink-0 px-1.5 py-1 text-sm text-[var(--fg-muted)]">{c.name}</div>
                  <div className="min-w-0 flex-1">
                    <PropertyEditor
                      col={c}
                      value={cellValue(page, c)}
                      onChange={(v) => void setCell(page.id, c.id, v)}
                      onCreateOption={(label) => {
                        const r = addOption(schema, c.id, label)
                        void saveSchema(db.id, r.schema)
                        return r.optionId
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
        <div className="-mx-12 mt-4">
          <PageEditor key={page.id} initial={page.content} editorRef={editorRef} onChange={(json) => saveLater({ content: json })} />
        </div>
      </div>
    </div>
  )
}
