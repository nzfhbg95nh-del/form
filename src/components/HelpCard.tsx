// Cartes d'aide illustrées : des cases côte à côte avec un petit dessin (souris, touches), un titre et une phrase,
// des points pour changer de page, « Passer » et « Suivant ». Réutilisables partout (bibliothèque, carte, moodboard, planning…).

import { useState, type ReactNode } from 'react'

/** Une souris dessinée ; `button` : le bouton mis en avant ; `drag` : de petites flèches de déplacement à côté. */
export function MouseIcon({ button = 'none', drag = false, cross = false }: { button?: 'left' | 'right' | 'wheel' | 'none'; drag?: boolean; cross?: boolean }) {
  return (
    <svg width="66" height="76" viewBox="0 0 56 64" fill="none" aria-hidden="true" className="shrink-0">
      {drag && (
        <g stroke="var(--fg-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6v10M3 11h10M8 6l-2 2M8 6l2 2M3 11l2-2M3 11l2 2M13 11l-2-2M13 11l-2 2M8 16l-2-2M8 16l2-2" />
        </g>
      )}
      <rect x="16" y="10" width="28" height="44" rx="14" fill="var(--bg)" stroke="var(--fg-muted)" strokeWidth="1.6" />
      <path d="M30 10v16M16 26h28" stroke="var(--fg-muted)" strokeWidth="1.2" opacity=".5" />
      {button === 'left' && <path d="M30 10.8V26H16.8v-2A13.2 13.2 0 0 1 30 10.8Z" fill="var(--accent)" opacity=".85" />}
      {button === 'right' && <path d="M30 10.8V26h13.2v-2A13.2 13.2 0 0 0 30 10.8Z" fill="var(--accent)" opacity=".85" />}
      <rect x="28.5" y="15" width="3" height="7" rx="1.5" fill={button === 'wheel' ? 'var(--accent)' : 'var(--fg)'} />
      {cross && (
        <g stroke="#d44c47" strokeWidth="2.2" strokeLinecap="round">
          <path d="M44 44l8 8M52 44l-8 8" />
        </g>
      )}
    </svg>
  )
}

/** Une touche du clavier dessinée (« Ctrl », « Maj », « Échap »…). */
export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-11 min-w-[4.5rem] items-center justify-center rounded-lg px-4 text-sm font-semibold" style={{ background: 'var(--bg)', boxShadow: 'var(--slider-shadow)' }}>
      {children}
    </span>
  )
}

/** « ou », « + » entre deux dessins. */
export const Joiner = ({ children }: { children: ReactNode }) => <span className="text-xs font-medium uppercase tracking-wide text-[var(--fg-muted)]">{children}</span>

export interface HelpStep { art: ReactNode; title: string; text: string }

/**
 * La carte d'aide : `perPage` cases par page (2 par défaut). `onClose` : Passer, Compris, ou Échap.
 * `inert` : on ne peut pas encore cliquer dedans (ex. pendant un glisser).
 */
export function HelpCard({ steps, onClose, perPage = 2, inert = false, className = '' }: { steps: HelpStep[]; onClose: () => void; perPage?: number; inert?: boolean; className?: string }) {
  const pages = Math.ceil(steps.length / perPage)
  const [page, setPage] = useState(0)
  const shown = steps.slice(page * perPage, page * perPage + perPage)
  const last = page >= pages - 1
  return (
    <div
      role="dialog"
      aria-label="Aide"
      className={'form-help w-[min(720px,calc(100vw-32px))] rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3 ' + className}
      style={{ boxShadow: 'var(--shadow-lift)', pointerEvents: inert ? 'none' : undefined }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((s) => (
          <div key={s.title} className="flex flex-col items-center rounded-xl px-5 pb-5 pt-6 text-center" style={{ background: 'var(--bg-side)' }}>
            <div className="flex h-16 items-center justify-center gap-4">{s.art}</div>
            <div className="my-4 h-px w-4/5" style={{ background: 'var(--border)' }} />
            <div className="text-[15px] font-semibold">{s.title}</div>
            <p className="mt-1 max-w-xs text-[13px] leading-snug text-[var(--fg-muted)]">{s.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 px-1">
        <div className="flex gap-1.5" aria-label={`Page ${page + 1} sur ${pages}`}>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === page ? 14 : 6, background: i === page ? 'var(--fg)' : 'color-mix(in srgb, var(--fg) 25%, transparent)' }} onClick={() => setPage(i)} aria-label={`Page ${i + 1}`} />
          ))}
        </div>
        <div className="flex-1" />
        {!last && <button className="btn" onClick={onClose}>Passer</button>}
        <button className="btn" style={{ background: 'var(--fg)', color: 'var(--bg)' }} onClick={() => (last ? onClose() : setPage(page + 1))}>{last ? 'Compris' : 'Suivant'}</button>
      </div>
    </div>
  )
}
