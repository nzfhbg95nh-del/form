// Bloc « Équation » : une formule écrite en LaTeX (comme dans Notion et AFFiNE), affichée par KaTeX (MIT, local, sans internet).

import { useMemo, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/** La formule en HTML, ou le message d'erreur de KaTeX si elle est incorrecte. */
export function renderLatex(latex: string, displayMode = true): { html: string; error: null } | { html: null; error: string } {
  try {
    return { html: katex.renderToString(latex, { displayMode, throwOnError: true, output: 'html', strict: 'ignore' }), error: null }
  } catch (e) {
    return { html: null, error: (e instanceof Error ? e.message : String(e)).replace(/^KaTeX parse error:\s*/, '') }
  }
}

export function EquationBlock({ latex, update }: { latex: string; update: (latex: string) => void }) {
  const [editing, setEditing] = useState(!latex)
  const [draft, setDraft] = useState(latex)
  const live = useMemo(() => (draft.trim() ? renderLatex(draft) : null), [draft])
  const done = () => { update(draft.trim()); setEditing(false) }

  if (editing) {
    return (
      <div contentEditable={false} className="w-full rounded-xl border border-[var(--border)] p-3">
        <textarea
          autoFocus
          value={draft}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') done(); if (e.key === 'Escape') { setDraft(latex); setEditing(!!latex ? false : true) } }}
          placeholder="Écris la formule en LaTeX, par exemple : \frac{a}{b} + \sqrt{x^2 + 1}"
          aria-label="Formule LaTeX"
          className="lib-input w-full resize-none rounded-lg border px-3 py-2 font-mono text-sm outline-none"
        />
        <div className="mt-2 min-h-8 overflow-x-auto text-center">
          {live?.html && <div dangerouslySetInnerHTML={{ __html: live.html }} />}
          {live?.error && <div className="text-left text-xs text-red-500">{live.error}</div>}
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-[var(--fg-muted)]">Ctrl+Entrée pour valider</span>
          <button type="button" className="btn btn-primary !px-3 !py-1 !text-xs" disabled={!draft.trim()} onClick={done}>Valider</button>
        </div>
      </div>
    )
  }
  const out = renderLatex(latex)
  return (
    <button
      type="button"
      contentEditable={false}
      onClick={() => { setDraft(latex); setEditing(true) }}
      title="Cliquer pour modifier la formule"
      className="w-full overflow-x-auto rounded-xl px-2 py-3 text-center transition-colors hover:bg-[var(--bg-hover)]"
    >
      {out.html ? <span dangerouslySetInnerHTML={{ __html: out.html }} /> : <span className="text-xs text-red-500">{out.error}</span>}
    </button>
  )
}

/** Équation « en ligne » : une petite formule au milieu d'une phrase. Un clic la modifie ; Entrée valide, Échap annule. */
export function InlineEquation({ latex, update }: { latex: string; update: (latex: string) => void }) {
  const [editing, setEditing] = useState(!latex)
  const [draft, setDraft] = useState(latex)
  const live = useMemo(() => (draft.trim() ? renderLatex(draft, false) : null), [draft])
  const done = () => {
    update(draft.trim())
    setEditing(false)
  }
  if (editing) {
    return (
      <span contentEditable={false} className="relative inline-block align-baseline">
        <input
          autoFocus
          value={draft}
          placeholder="LaTeX, par exemple x^2"
          aria-label="Formule LaTeX en ligne"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') { e.preventDefault(); done() }
            if (e.key === 'Escape') { setDraft(latex); setEditing(!latex) }
          }}
          onBlur={() => { if (draft.trim() || latex) done() }}
          className="rounded border border-[var(--border)] bg-transparent px-1 font-mono text-sm outline-none focus:border-[var(--accent)]"
          size={Math.max(12, draft.length + 2)}
        />
        {live && (
          <span className="absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 shadow-lg">
            {live.html ? <span dangerouslySetInnerHTML={{ __html: live.html }} /> : <span className="text-xs text-red-500">{live.error}</span>}
          </span>
        )}
      </span>
    )
  }
  const out = renderLatex(latex, false)
  return (
    <span
      role="button"
      tabIndex={0}
      contentEditable={false}
      title="Cliquer pour modifier la formule"
      onClick={() => { setDraft(latex); setEditing(true) }}
      onKeyDown={(e) => { if (e.key === 'Enter') { setDraft(latex); setEditing(true) } }}
      className="inline-block cursor-pointer rounded px-0.5 hover:bg-[var(--bg-hover)]"
    >
      {out.html ? <span dangerouslySetInnerHTML={{ __html: out.html }} /> : <span className="text-xs text-red-500">{out.error}</span>}
    </span>
  )
}