import { useEffect, useMemo, useRef, useState } from 'react'
import { Database, FileText, Rows3 } from 'lucide-react'
import { searchObjects } from '@/lib/search'
import { useApp } from '@/store/app'

export function SearchPalette() {
  const { objects, select, setSearch, searchNewTab } = useApp()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const hits = useMemo(() => searchObjects(objects, query), [objects, query])

  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const open = (i: number) => {
    const hit = hits[i]
    if (!hit) return
    select(hit.object.id, { newTab: searchNewTab })
    setSearch(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]" onMouseDown={() => setSearch(false)}>
      <div
        className="w-[560px] max-w-[90vw] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          placeholder="Rechercher une page, une ligne, un mot…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearch(false)
            else if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, hits.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
            else if (e.key === 'Enter') open(index)
          }}
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-3 text-base outline-none"
        />
        <div ref={list} className="max-h-[50vh] overflow-y-auto p-1">
          {query === '' && <div className="px-3 py-1 text-xs text-[var(--fg-muted)]">Récents</div>}
          {hits.map((h, i) => (
            <button
              key={h.object.id}
              onMouseEnter={() => setIndex(i)}
              onClick={() => open(i)}
              className={'flex w-full items-start gap-2 rounded px-3 py-2 text-left text-sm ' + (i === index ? 'bg-[var(--bg-hover)]' : '')}
            >
              <span className="mt-0.5 w-4 shrink-0 text-center">
                {h.object.icon ??
                  (h.object.type === 'database' ? <Database size={14} /> : h.object.type === 'row' ? <Rows3 size={14} /> : <FileText size={14} />)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{h.object.title || 'Sans titre'}</span>
                {h.path.length > 0 && <span className="block truncate text-xs text-[var(--fg-muted)]">{h.path.join(' › ')}</span>}
                {h.snippet && <span className="block truncate text-xs text-[var(--fg-muted)]">{h.snippet}</span>}
              </span>
            </button>
          ))}
          {hits.length === 0 && <div className="px-3 py-4 text-sm text-[var(--fg-muted)]">Aucun résultat.</div>}
        </div>
      </div>
    </div>
  )
}
