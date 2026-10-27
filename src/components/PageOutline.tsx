// Autour d'une page : le plan (les titres, cliquables) sur le côté, et « Mentionné dans » (les pages qui la citent) en bas.

import { useMemo, useState } from 'react'
import { Icon } from '@/components/Icon'
import { backlinksTo, pageHeadings } from '@/lib/pageLinks'
import { displayTitle } from '@/lib/lastEdit'
import { useApp } from '@/store/app'

/** Le plan de la page : de petits traits sur le bord de la fenêtre ; au survol, la liste des titres (un clic y va). */
export function PageOutline({ content }: { content: string | null }) {
  const heads = useMemo(() => pageHeadings(content), [content])
  const [hover, setHover] = useState(false)
  if (heads.length < 2) return null
  const go = (id: string) => document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <nav
      aria-label="Plan de la page"
      className="fixed right-4 top-28 z-20 hidden max-h-[60vh] xl:block"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover ? (
        <div className="w-56 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-2 shadow-[var(--shadow-lift)]">
          <div className="lib-count px-2 pb-1 pt-0.5">Plan</div>
          {heads.map((h) => (
            <button
              key={h.id}
              onClick={() => go(h.id)}
              className="block w-full truncate rounded-lg px-2 py-1 text-left text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
              style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
              title={h.text}
            >
              {h.text}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-end gap-1.5 px-1 py-2" aria-hidden>
          {heads.slice(0, 18).map((h) => (
            <span key={h.id} className="h-[3px] rounded-full bg-[var(--fg-muted)]/40" style={{ width: 22 - (h.level - 1) * 5 }} />
          ))}
        </div>
      )}
    </nav>
  )
}

/** Les pages qui citent celle-ci (par un @ ou un bloc de page). */
export function Backlinks({ pageId }: { pageId: string }) {
  const objects = useApp((s) => s.objects)
  const select = useApp((s) => s.select)
  const from = useMemo(() => backlinksTo(objects, pageId), [objects, pageId])
  if (from.length === 0) return null
  return (
    <section className="mt-10 border-t border-[var(--border)] pt-4" aria-label="Pages qui citent celle-ci">
      <div className="lib-count mb-2">Mentionné dans</div>
      <div className="flex flex-wrap gap-2">
        {from.map((o) => (
          <button key={o.id} onClick={() => select(o.id)} className="btn !px-2.5 !py-1 !text-xs" title={displayTitle(o.title)}>
            <Icon value={o.icon ?? '📄'} size={14} />
            <span className="max-w-[16rem] truncate">{displayTitle(o.title)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
