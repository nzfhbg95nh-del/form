import { useEffect, useMemo, useRef, useState } from 'react'
import { Briefcase, Database, FileText, Rows3, Users } from 'lucide-react'
import { searchBusiness } from '@/lib/business'
import { searchObjects } from '@/lib/search'
import { useApp } from '@/store/app'

type Entry =
  | { type: 'page'; id: string; title: string; icon: string | null; kind: string; subtitle: string | null }
  | { type: 'client'; id: string; title: string; subtitle: string }
  | { type: 'service'; id: string; title: string; subtitle: string }

export function SearchPalette() {
  const { objects, clients, services, select, show, setEditing, setSearch, searchNewTab } = useApp()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  const entries = useMemo<Entry[]>(() => {
    const pages: Entry[] = searchObjects(objects, query).map((h) => ({
      type: 'page',
      id: h.object.id,
      title: h.object.title || 'Sans titre',
      icon: h.object.icon,
      kind: h.object.type,
      subtitle: [h.path.join(' › '), h.snippet].filter(Boolean).join('\n') || null,
    }))
    const business: Entry[] = searchBusiness(clients, services, query).map((b) => ({ type: b.kind, id: b.id, title: b.title, subtitle: b.subtitle }) as Entry)
    return [...pages, ...business]
  }, [objects, clients, services, query])

  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const open = (i: number) => {
    const entry = entries[i]
    if (!entry) return
    if (entry.type === 'page') select(entry.id, { newTab: searchNewTab })
    else {
      show(entry.type === 'client' ? 'clients' : 'services')
      setEditing({ kind: entry.type, id: entry.id })
    }
    setSearch(false)
  }

  const icon = (e: Entry) => {
    if (e.type === 'client') return <Users size={14} />
    if (e.type === 'service') return <Briefcase size={14} />
    return e.icon ?? (e.kind === 'database' ? <Database size={14} /> : e.kind === 'row' ? <Rows3 size={14} /> : <FileText size={14} />)
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
          placeholder="Rechercher une page, un client, une prestation, un mot…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearch(false)
            else if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, entries.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
            else if (e.key === 'Enter') open(index)
          }}
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-3 text-base outline-none"
        />
        <div ref={list} className="max-h-[50vh] overflow-y-auto p-1">
          {query === '' && <div className="px-3 py-1 text-xs text-[var(--fg-muted)]">Récents</div>}
          {entries.map((e, i) => (
            <button
              key={e.type + e.id}
              onMouseEnter={() => setIndex(i)}
              onClick={() => open(i)}
              className={'flex w-full items-start gap-2 rounded px-3 py-2 text-left text-sm ' + (i === index ? 'bg-[var(--bg-hover)]' : '')}
            >
              <span className="mt-0.5 w-4 shrink-0 text-center">{icon(e)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{e.title}</span>
                {e.subtitle && e.subtitle.split('\n').map((line) => <span key={line} className="block truncate text-xs text-[var(--fg-muted)]">{line}</span>)}
              </span>
            </button>
          ))}
          {entries.length === 0 && <div className="px-3 py-4 text-sm text-[var(--fg-muted)]">Aucun résultat.</div>}
        </div>
      </div>
    </div>
  )
}
