// Bloc « Équation » : une formule écrite en LaTeX (comme dans Notion et AFFiNE), affichée par KaTeX (MIT, local, sans internet).

import { useMemo, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/** La formule en HTML, ou le message d'erreur de KaTeX si elle est incorrecte. */
export function renderLatex(latex: string): { html: string; error: null } | { html: null; error: string } {
  try {
    return { html: katex.renderToString(latex, { displayMode: true, throwOnError: true, output: 'html', strict: 'ignore' }), error: null }
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
