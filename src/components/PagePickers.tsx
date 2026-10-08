import { useEffect, useMemo, useRef, useState } from 'react'
import { Image as ImageIcon, Smile } from 'lucide-react'
import { Icon } from '@/components/Icon'
import { DEFAULT_MODEL, generateIconImage, iconAiAvailable, suggestEmojis } from '@/lib/ai'
import { readFileAsDataUrl } from '@/lib/content'
import {
  CALLOUT_EMOJIS, GROUPS, groupEmojis, loadEmojiData, loadRecents, pushRecent, randomEmoji, saveRecents, searchEmojis, SKIN_TONES, withSkin,
  type EmojiItem,
} from '@/lib/emoji'
import { useApp } from '@/store/app'

export const COVERS = [
  'linear-gradient(135deg, #f6d365, #fda085)',
  'linear-gradient(135deg, #84fab0, #8fd3f4)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #434343, #000000)',
  '#e8d5c4',
  '#c9d6df',
  '#d4e2d4',
]

export function coverStyle(cover: string): React.CSSProperties {
  return cover.startsWith('data:')
    ? { backgroundImage: `url(${cover})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: cover }
}

const pop = 'absolute z-20 mt-1 rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 shadow-lg'
const btn = 'rounded px-2 py-1 text-sm hover:bg-[var(--bg-hover)]'

type PickerTab = 'emoji' | 'upload' | 'ai'

/** Réduit une image à `size` pixels (carré, recadrée au centre) pour ne pas alourdir la base. */
async function shrinkImage(dataUrl: string, size = 128): Promise<string> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const side = Math.min(img.width, img.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
  return canvas.toDataURL('image/png')
}

function EmojiButton({ e, onPick, label }: { e: string; onPick: (e: string) => void; label?: string }) {
  return (
    <button className="flex h-8 w-8 items-center justify-center rounded hover:bg-[var(--bg-hover)]" title={label} aria-label={label ?? e} onClick={() => onPick(e)}>
      <Icon value={e} size={22} />
    </button>
  )
}

export function IconPicker({ value, onChange, trigger, startOpen = false, onClosed }: { value: string | null; onChange: (v: string | null) => void; trigger?: React.ReactNode; startOpen?: boolean; onClosed?: () => void }) {
  const repo = useApp((st) => st.repo)
  const [open, setOpen] = useState(startOpen)
  const wasOpen = useRef(startOpen)
  useEffect(() => {
    if (wasOpen.current && !open) onClosed?.()
    wasOpen.current = open
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<PickerTab>('emoji')
  const [all, setAll] = useState<EmojiItem[]>([])
  const [query, setQuery] = useState('')
  const [tone, setTone] = useState(0)
  const [toneOpen, setToneOpen] = useState(false)
  const [recents, setRecents] = useState<string[]>([])
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [suggested, setSuggested] = useState<string[]>([])
  const [drawn, setDrawn] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || all.length) return
    void loadEmojiData().then(setAll)
  }, [open, all.length])
  useEffect(() => {
    if (open) {
      setRecents(loadRecents())
      try { setTone(Number(localStorage.getItem('form-emoji-tone') ?? 0) || 0) } catch { /* sans importance */ }
    }
  }, [open])

  const groups = useMemo(() => groupEmojis(all), [all])
  const found = useMemo(() => (query.trim() ? searchEmojis(all, query) : []), [all, query])

  const choose = (v: string | null) => {
    if (v && !v.startsWith('data:')) {
      const next = pushRecent(recents, v)
      setRecents(next)
      saveRecents(next)
    }
    onChange(v)
    setOpen(false)
  }
  const pickEmoji = (e: EmojiItem) => choose(withSkin(e, tone))
  const chooseTone = (t: number) => {
    setTone(t)
    setToneOpen(false)
    try { localStorage.setItem('form-emoji-tone', String(t)) } catch { /* sans importance */ }
  }
  const aiModel = async () => (await repo?.getSetting('gemini_model')) || DEFAULT_MODEL
  const runAi = async (job: () => Promise<void>) => {
    setAiBusy(true)
    setAiError('')
    try { await job() } catch (e) { setAiError(e instanceof Error ? e.message : String(e)) } finally { setAiBusy(false) }
  }

  const tabBtn = (id: PickerTab, label: string) => (
    <button key={id} className={'border-b-2 px-2 py-1.5 text-sm ' + (tab === id ? 'border-[var(--fg)] text-[var(--fg)]' : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]')} onClick={() => setTab(id)}>
      {label}
    </button>
  )

  return (
    <div className="relative inline-block">
      {trigger ? (
        <button type="button" data-callout-icon className="rounded p-0.5 hover:bg-[var(--bg-hover)]" aria-label="Changer l’icône" onClick={() => setOpen(!open)}>{trigger}</button>
      ) : (
        <button className={btn} onClick={() => setOpen(!open)}>
          <Smile size={14} className="mr-1.5 inline align-text-bottom" />{value ? 'Changer l’icône' : 'Ajouter une icône'}
        </button>
      )}
      {open && <div className="fixed inset-0 z-10" onMouseDown={() => setOpen(false)} />}
      {open && (
        <div className={pop + ' p-0'} style={{ width: 380 }} role="dialog" aria-label="Choisir une icône">
          <div className="flex items-center border-b border-[var(--border)] px-2">
            {tabBtn('emoji', 'Émoji')}
            {tabBtn('upload', 'Charger')}
            {tabBtn('ai', '✨ Avec l’IA')}
            <div className="flex-1" />
            {value && <button className="rounded px-2 py-1 text-xs text-red-500 hover:bg-[var(--bg-hover)]" onClick={() => choose(null)}>Supprimer</button>}
          </div>

          {tab === 'emoji' && (
            <div>
              <div className="flex items-center gap-1 p-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filtrer…"
                  className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
                />
                <button className="rounded p-1.5 hover:bg-[var(--bg-hover)]" title="Au hasard" aria-label="Emoji au hasard" disabled={!all.length} onClick={() => choose(randomEmoji(all))}>🎲</button>
                <div className="relative">
                  <button className="rounded p-1.5 hover:bg-[var(--bg-hover)]" title="Teinte de peau" aria-label="Teinte de peau" onClick={() => setToneOpen(!toneOpen)}>
                    <Icon value={SKIN_TONES[tone]} size={18} />
                  </button>
                  {toneOpen && (
                    <div className="absolute right-0 z-30 mt-1 flex rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-lg">
                      {SKIN_TONES.map((t, i) => (
                        <button key={t} aria-label={`Teinte ${i}`} className="rounded p-1 hover:bg-[var(--bg-hover)]" onClick={() => chooseTone(i)}>
                          <Icon value={t} size={20} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div ref={scroller} className="h-72 overflow-y-auto px-2 pb-2">
                {!all.length && <p className="p-2 text-sm text-[var(--fg-muted)]">Chargement…</p>}
                {query.trim() ? (
                  found.length ? (
                    <div className="flex flex-wrap">{found.map((e) => <EmojiButton key={e.hexcode} e={withSkin(e, tone)} label={e.label} onPick={() => pickEmoji(e)} />)}</div>
                  ) : all.length > 0 && <p className="p-2 text-sm text-[var(--fg-muted)]">Aucun emoji trouvé.</p>
                ) : (
                  <>
                    {recents.length > 0 && (
                      <section>
                        <h4 className="px-1 pb-1 pt-2 text-xs font-medium text-[var(--fg-muted)]">Récents</h4>
                        <div className="flex flex-wrap">{recents.map((e) => <EmojiButton key={e} e={e} onPick={choose} />)}</div>
                      </section>
                    )}
                    <section data-group="callout">
                      <h4 className="px-1 pb-1 pt-3 text-xs font-medium text-[var(--fg-muted)]">Encadré</h4>
                      <div className="flex flex-wrap">{CALLOUT_EMOJIS.map((e) => <EmojiButton key={e} e={e} onPick={choose} />)}</div>
                    </section>
                    {groups.map((g) => (
                      <section key={g.key} data-group={g.key}>
                        <h4 className="px-1 pb-1 pt-3 text-xs font-medium text-[var(--fg-muted)]">{g.label}</h4>
                        <div className="flex flex-wrap">{g.items.map((e) => <EmojiButton key={e.hexcode} e={withSkin(e, tone)} label={e.label} onPick={() => pickEmoji(e)} />)}</div>
                      </section>
                    ))}
                  </>
                )}
              </div>
              {!query.trim() && (
                <div className="flex justify-between border-t border-[var(--border)] px-2 py-1">
                  <button className="rounded p-1 hover:bg-[var(--bg-hover)]" title="Récents" aria-label="Récents" onClick={() => scroller.current?.scrollTo({ top: 0 })}>
                    <Icon value="🕐" size={16} />
                  </button>
                  {GROUPS.map((g) => (
                    <button key={g.key} className="rounded p-1 hover:bg-[var(--bg-hover)]" title={g.label} aria-label={g.label}
                      onClick={() => scroller.current?.querySelector(`[data-group="${g.key}"]`)?.scrollIntoView({ block: 'start' })}>
                      <Icon value={g.icon} size={16} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'upload' && (
            <div className="p-4 text-center">
              <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-hover)]" onClick={() => file.current?.click()}>Charger une image…</button>
              <p className="mt-2 text-xs text-[var(--fg-muted)]">Elle sera recadrée en carré et réduite (128 px).</p>
              <input
                ref={file}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) choose(await shrinkImage(await readFileAsDataUrl(f)))
                }}
              />
            </div>
          )}

          {tab === 'ai' && (
            <div className="p-3">
              {!iconAiAvailable() ? (
                <p className="text-sm text-[var(--fg-muted)]">L’assistant IA n’est disponible que dans l’application Windows.</p>
              ) : (
                <>
                  <textarea
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    rows={2}
                    placeholder="Décris l’icône : « un singe qui fait de la céramique »…"
                    className="w-full resize-none rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
                  />
                  <div className="mt-2 flex gap-2">
                    <button disabled={aiBusy || !aiText.trim()} className="rounded border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50"
                      onClick={() => void runAi(async () => { setDrawn(null); setSuggested(await suggestEmojis(aiText, await aiModel())) })}>
                      Proposer des emojis
                    </button>
                    <button disabled={aiBusy || !aiText.trim()} className="rounded border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50"
                      onClick={() => void runAi(async () => { setSuggested([]); setDrawn(await shrinkImage(await generateIconImage(aiText))) })}>
                      Dessiner une icône
                    </button>
                  </div>
                  {aiBusy && <p className="mt-2 text-sm text-[var(--fg-muted)]">Gemini réfléchit…</p>}
                  {aiError && <p className="mt-2 text-sm text-red-500">{aiError}</p>}
                  {suggested.length > 0 && <div className="mt-2 flex flex-wrap">{suggested.map((e) => <EmojiButton key={e} e={e} onPick={choose} />)}</div>}
                  {drawn && (
                    <div className="mt-2 flex items-center gap-3">
                      <Icon value={drawn} size={64} />
                      <button className="rounded border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--bg-hover)]" onClick={() => choose(drawn)}>Utiliser cette icône</button>
                    </div>
                  )}
                  <p className="mt-3 text-xs text-[var(--fg-muted)]">Seule ta description part chez Google, et seulement quand tu cliques. Le dessin d’icônes n’est pas toujours inclus dans le palier gratuit.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function CoverPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  return (
    <div className="relative inline-block">
      <button className={btn} onClick={() => setOpen(!open)}>
        <ImageIcon size={14} className="mr-1.5 inline align-text-bottom" />{value ? 'Changer la couverture' : 'Ajouter une image de couverture'}
      </button>
      {open && (
        <div className={pop} style={{ width: 280 }}>
          <div className="grid grid-cols-4 gap-2">
            {COVERS.map((c) => (
              <button
                key={c}
                aria-label="Choisir cette couverture"
                className="h-10 rounded border border-[var(--border)]"
                style={coverStyle(c)}
                onClick={() => { onChange(c); setOpen(false) }}
              />
            ))}
          </div>
          <button className={btn + ' mt-2'} onClick={() => file.current?.click()}>Importer une image…</button>
          {value && (
            <button className={btn + ' text-red-500'} onClick={() => { onChange(null); setOpen(false) }}>
              Retirer la couverture
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) { onChange(await readFileAsDataUrl(f)); setOpen(false) }
            }}
          />
        </div>
      )}
    </div>
  )
}
