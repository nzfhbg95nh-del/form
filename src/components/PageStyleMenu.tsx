import { useState } from 'react'
import type { BlockNoteEditor } from '@blocknote/core'
import { Copy, FileDown, Link2, MoreHorizontal } from 'lucide-react'
import { exportFileName, parsePageStyle, withPageStyle, type PageFont, type PageStyle } from '@/lib/pageStyle'
import { saveBlob } from '@/lib/pdf/savePdf'
import { copyText, pageLink } from '@/lib/windowActions'
import { useApp } from '@/store/app'
import type { ObjectRow } from '@/lib/types'

const FONT_LABELS: { id: PageFont; label: string; sample: string }[] = [
  { id: 'default', label: 'Par défaut', sample: 'Ag' },
  { id: 'serif', label: 'Serif', sample: 'Ag' },
  { id: 'mono', label: 'Mono', sample: 'Ag' },
]
const FONT_FAMILY: Record<PageFont, string> = {
  default: 'inherit',
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  mono: "'IBM Plex Mono', ui-monospace, Consolas, monospace",
}

/** Menu « ⋯ » d'une page, comme Notion : police, texte réduit, pleine largeur, verrouillage, lien, export. */
export function PageStyleMenu({ page, editorRef }: { page: ObjectRow; editorRef: React.MutableRefObject<BlockNoteEditor<never, never, never> | null> }) {
  const update = useApp((s) => s.update)
  const duplicate = useApp((s) => s.duplicate)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const style = parsePageStyle(page.properties)
  const set = (patch: Partial<PageStyle>) => void update(page.id, { properties: withPageStyle(page.properties, patch) })
  const say = (text: string) => {
    setNote(text)
    window.setTimeout(() => setNote(''), 2500)
  }

  const exportMarkdown = async () => {
    const editor = editorRef.current
    if (!editor) return
    const body = await editor.blocksToMarkdownLossy(editor.document as never)
    const text = `# ${page.title || 'Nouvelle page'}\n\n${body}`
    const saved = await saveBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), exportFileName(page.title, 'md'), { name: 'Markdown', extensions: ['md'] })
    if (saved) say('Page exportée.')
  }

  const row = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]'
  const toggle = (label: string, on: boolean, change: (v: boolean) => void) => (
    <button role="switch" aria-checked={on} className={row} onClick={() => change(!on)}>
      <span className="flex-1">{label}</span>
      <span className={'flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ' + (on ? 'bg-[var(--accent)]' : 'bg-[var(--border)]')}>
        <span className={'h-3 w-3 rounded-full bg-white transition-transform ' + (on ? 'translate-x-3' : '')} />
      </span>
    </button>
  )

  return (
    <div className="relative">
      <button title="Options de la page" aria-label="Options de la page" onClick={() => setOpen(!open)} className="rounded p-1.5 hover:bg-[var(--bg-hover)]">
        <MoreHorizontal size={16} className="text-[var(--fg-muted)]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onMouseDown={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-64 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-xl" role="menu">
            <div className="flex gap-1 p-1">
              {FONT_LABELS.map((f) => (
                <button
                  key={f.id}
                  aria-pressed={style.font === f.id}
                  onClick={() => set({ font: f.id })}
                  className={'flex flex-1 flex-col items-center rounded py-1.5 hover:bg-[var(--bg-hover)] ' + (style.font === f.id ? 'bg-[var(--bg-hover)] ring-1 ring-[var(--accent)]' : '')}
                >
                  <span className="text-xl leading-none" style={{ fontFamily: FONT_FAMILY[f.id] }}>{f.sample}</span>
                  <span className="mt-1 text-[11px] text-[var(--fg-muted)]">{f.label}</span>
                </button>
              ))}
            </div>
            <div className="my-1 border-t border-[var(--border)]" />
            {toggle('Texte réduit', style.small, (v) => set({ small: v }))}
            {toggle('Pleine largeur', style.wide, (v) => set({ wide: v }))}
            {toggle('Verrouiller la page', style.locked, (v) => set({ locked: v }))}
            <div className="my-1 border-t border-[var(--border)]" />
            <button className={row} onClick={() => { setOpen(false); void copyText(pageLink(page.id)).then(() => say('Lien copié.')) }}>
              <Link2 size={14} /><span className="flex-1">Copier le lien</span><span className="text-xs text-[var(--fg-muted)]">Ctrl+L</span>
            </button>
            <button className={row} onClick={() => { setOpen(false); void duplicate(page.id) }}>
              <Copy size={14} /><span className="flex-1">Dupliquer</span><span className="text-xs text-[var(--fg-muted)]">Ctrl+D</span>
            </button>
            <button className={row} onClick={() => { setOpen(false); void exportMarkdown() }}>
              <FileDown size={14} /><span className="flex-1">Exporter en Markdown</span>
            </button>
          </div>
        </>
      )}
      {note && <div className="absolute right-0 top-full z-40 mt-1 whitespace-nowrap rounded bg-[var(--fg)] px-2 py-1 text-xs text-[var(--bg)]">{note}</div>}
    </div>
  )
}

export const pageFontFamily = (font: PageFont) => FONT_FAMILY[font]
