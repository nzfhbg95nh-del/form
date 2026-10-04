import { useEffect, useRef } from 'react'
import type { SuggestionMenuProps } from '@blocknote/react'

export interface SlashItem {
  key: string
  title: string
  subtext?: string
  aliases?: string[]
  group: string
  badge?: string
  icon: React.ReactNode
  onItemClick: () => void
}

/** Menu « / » compact, façon Notion : sections, icône, nom, raccourci à droite, pied « Fermer le menu ». */
export function SlashMenu({ items, loadingState, selectedIndex, onItemClick }: SuggestionMenuProps<SlashItem>) {
  const selected = useRef<HTMLDivElement>(null)
  const handled = useRef(false)
  useEffect(() => {
    selected.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <div
      role="listbox"
      aria-label="Ajouter un bloc"
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
      className="flex w-[300px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--fg)] shadow-xl"
    >
      <div className="max-h-[360px] overflow-y-auto p-1">
        {items.length === 0 && loadingState !== 'loading-initial' && <div className="px-3 py-3 text-[var(--fg-muted)]">Aucun résultat</div>}
        {items.map((item, i) => {
          const showGroup = i === 0 || items[i - 1].group !== item.group
          const active = i === selectedIndex
          return (
            <div key={item.key}>
              {showGroup && <div className="px-2 pb-1 pt-2 text-xs font-medium text-[var(--fg-muted)]">{item.group}</div>}
              <div
                ref={active ? selected : undefined}
                role="option"
                aria-selected={active}
                title={item.subtext}
                // On agit dès l'appui : sinon l'éditeur perd le focus, le menu se ferme et le clic n'arrive jamais.
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  e.preventDefault()
                  handled.current = true
                  onItemClick?.(item)
                }}
                onClick={() => {
                  if (handled.current) handled.current = false
                  else onItemClick?.(item)
                }}
                className={'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 ' + (active ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]')}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--fg-muted)]">{item.icon}</span>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.badge && <span className="shrink-0 text-xs text-[var(--fg-muted)]">{item.badge}</span>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-1.5 text-xs text-[var(--fg-muted)]">
        <span>Fermer le menu</span>
        <span>esc</span>
      </div>
    </div>
  )
}
