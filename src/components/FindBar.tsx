import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { findAll, stepIndex } from '@/lib/findInPage'

type Highlights = { set: (name: string, h: unknown) => void; delete: (name: string) => void }
const highlights = (): Highlights | null => (typeof CSS !== 'undefined' ? ((CSS as unknown as { highlights?: Highlights }).highlights ?? null) : null)
const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight

/** La barre « Chercher dans la page » (Ctrl+F) : les résultats sont surlignés dans le texte, Entrée / Maj+Entrée passent de l'un à l'autre. */
export function FindBar({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [count, setCount] = useState(0)
  const ranges = useRef<Range[]>([])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  // Cherche dans tous les textes de la page, puis recommence quand la page change (quelqu'un écrit pendant la recherche).
  useEffect(() => {
    const root = document.querySelector('.page-body .bn-editor')
    const paint = () => {
      ranges.current = []
      if (root && query) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? ''
          for (const at of findAll(text, query)) {
            const r = document.createRange()
            r.setStart(node, at)
            r.setEnd(node, at + query.length)
            ranges.current.push(r)
          }
        }
      }
      setCount(ranges.current.length)
      setIndex((i) => (ranges.current.length === 0 ? 0 : Math.min(i, ranges.current.length - 1)))
    }
    paint()
    if (!root) return
    let timer: number | undefined
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(paint, 200)
    })
    observer.observe(root, { subtree: true, childList: true, characterData: true })
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [query])

  // Surligne tous les résultats, et le résultat courant d'une autre couleur ; la page défile jusqu'à lui.
  useEffect(() => {
    const h = highlights()
    if (h && HighlightCtor) {
      h.set('find', new HighlightCtor(...ranges.current))
      const current = ranges.current[index]
      if (current) h.set('find-current', new HighlightCtor(current))
      else h.delete('find-current')
    }
    ranges.current[index]?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [index, count, query])

  useEffect(() => () => {
    highlights()?.delete('find')
    highlights()?.delete('find-current')
  }, [])

  const step = (dir: 1 | -1) => setIndex((i) => stepIndex(i, count, dir))

  return (
    <div role="search" data-ui className="absolute right-4 top-12 z-20 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 shadow-lg">
      <input
        ref={input}
        value={query}
        placeholder="Chercher dans la page"
        aria-label="Chercher dans la page"
        onChange={(e) => { setQuery(e.target.value); setIndex(0) }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          else if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1) }
        }}
        className="w-48 bg-transparent px-1 text-sm outline-none placeholder:text-[var(--fg-muted)]"
      />
      <span className="min-w-12 text-center text-xs text-[var(--fg-muted)]" aria-live="polite">{query ? (count === 0 ? 'Aucun' : `${index + 1} / ${count}`) : ''}</span>
      <button type="button" aria-label="Résultat précédent" title="Précédent (Maj+Entrée)" disabled={count === 0} onClick={() => step(-1)} className="rounded p-1 hover:bg-[var(--bg-hover)] disabled:opacity-40"><ChevronUp size={14} /></button>
      <button type="button" aria-label="Résultat suivant" title="Suivant (Entrée)" disabled={count === 0} onClick={() => step(1)} className="rounded p-1 hover:bg-[var(--bg-hover)] disabled:opacity-40"><ChevronDown size={14} /></button>
      <button type="button" aria-label="Fermer la recherche" title="Fermer (Échap)" onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-hover)]"><X size={14} /></button>
    </div>
  )
}