import { dateText, dateTimeText } from '@/lib/dateShortcuts'
import { EMPTY_LINE_HINT } from '@/lib/editorKeys'
import { EquationBlock } from '@/components/EquationBlock'
import { BookmarkBlock, EmbedBlock, PageCardBlock, PasteLinkMenu } from '@/components/LinkBlocks'
import { embedFor, isUrl } from '@/lib/embeds'
import { useEffect, useLayoutEffect, useState } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, defaultProps, filterSuggestionItems, type BlockNoteEditor } from '@blocknote/core'
import { fr } from '@blocknote/core/locales'
import { afterRemoval, flatten, neighbour, rangeIds, withoutIds, type BlockLike } from '@/lib/blockSelection'
import { useBlockSel } from '@/store/blockSel'
import { SELECTION_FILL, selectionBox } from '@/lib/selectionBox'
import { colorProp, loadRecentColor, nextColor } from '@/lib/blockKinds'
import { blockLink, strippedCopy } from '@/lib/blocks'
import { copyText } from '@/lib/windowActions'
import { BlockNoteView } from '@blocknote/mantine'
import {
  createReactBlockSpec,
  createReactInlineContentSpec,
  getDefaultReactSlashMenuItems,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react'
import {
  locales as multiColumnLocales,
  multiColumnDropCursor,
  withMultiColumn,
} from '@blocknote/xl-multi-column'
import '@blocknote/mantine/style.css'
import { CircleDot, Code, Columns2, Columns3, Columns4, Database, FileText, Heading1, Heading2, Heading3, Heading4, Image as ImageIcon, Images, List, ChefHat, ListChecks, ListCollapse, ListOrdered, ListTree, Users, Minus, Paperclip, Quote as QuoteIcon, Table as TableIcon, Type, Video, Volume2, type LucideIcon, Globe, Link2, CalendarDays, Sigma, PictureInPicture2, Maximize2 } from 'lucide-react'
import { BlockMenu } from '@/components/BlockMenu'
import { Icon } from '@/components/Icon'
import { IconPicker } from '@/components/PagePickers'
import { createPortionsBlock, createRecipePhotoBlock } from '@/components/RecipeBlocks'
import { SlashMenu, type SlashItem } from '@/components/SlashMenu'
import { recipeSlashBlocks } from '@/lib/recipes'
import { DatabaseView } from '@/components/DatabaseView'
import { MoodboardView } from '@/components/MoodboardView'
import { resolveForEditor } from '@/biblio/lib/libraryUrl.ts'
import { parseContent, readFileAsDataUrl } from '@/lib/content'
import { parseBoard } from '@/lib/moodboard'
import { openFloatingBoard } from '@/lib/floating'
import { normalize } from '@/lib/search'
import { isSystemDatabase } from '@/lib/database'
import { useApp } from '@/store/app'

// Couleurs de fond / de texte des blocs (mêmes noms que ceux du menu « Couleur » de l'éditeur).
const CALLOUT_BG: Record<string, [string, string]> = {
  gray: ['#ebeced', '#373737'], brown: ['#e9e5e3', '#452a21'], red: ['#fbe4e4', '#5c1a1a'], orange: ['#f6e9d9', '#5a3a14'],
  yellow: ['#fbf3db', '#5a4b1a'], green: ['#ddedea', '#1c4036'], blue: ['#ddebf1', '#1b3a55'], purple: ['#eae4f2', '#3b2a5a'], pink: ['#f4dfeb', '#5a2742'],
}

// Bloc « Encadré » : une phrase mise en avant dans un cadre, avec une icône (cliquable pour la changer) et une couleur.
function CalloutIcon({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    // Sans icône : le cadre reste vide (comme dans Notion) ; le sélecteur reste joignable par « Modifier l'icône ».
    <span contentEditable={false} data-callout-icon-wrap className={value ? 'mt-0.5 shrink-0' : 'absolute left-3 top-3 h-0 w-0 overflow-visible'}>
      <IconPicker
        value={value}
        onChange={(v) => onChange(v ?? '')}
        trigger={value ? <Icon value={value} size={22} /> : <span className="block h-0 w-0" />}
      />
    </span>
  )
}

const createCallout = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
      backgroundColor: defaultProps.backgroundColor,
      emoji: { default: '💡' },
    },
    content: 'inline',
  },
  {
    render: (props) => {
      const dark = useApp.getState().theme === 'dark'
      const bg = CALLOUT_BG[props.block.props.backgroundColor]
      return (
        <div
          style={{
            display: 'flex',
            position: 'relative',
            gap: props.block.props.emoji ? 10 : 0,
            width: '100%',
            padding: '12px 14px',
            borderRadius: 6,
            background: bg ? bg[dark ? 1 : 0] : 'var(--bg-hover)',
          }}
        >
          <CalloutIcon value={props.block.props.emoji} onChange={(emoji) => props.editor.updateBlock(props.block, { props: { emoji } } as never)} />
          <div ref={props.contentRef} style={{ flex: 1, minWidth: 0 }} />
        </div>
      )
    },
  },
)

// Bloc « Tâche » à trois états : à faire (case vide), en cours (case à moitié pleine), fait (case cochée, texte barré).
// Un clic sur la case passe à l'état suivant. La liste à cases à cocher « normale » existe toujours à côté.
const TODO_ORDER = ['todo', 'doing', 'done'] as const
const TODO_LABEL = { todo: 'À faire', doing: 'En cours', done: 'Fait' }

function TodoBox({ status }: { status: (typeof TODO_ORDER)[number] }) {
  const color = status === 'doing' ? '#e0a100' : status === 'done' ? '#2383e2' : 'var(--fg-muted)'
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="1.5" y="1.5" width="15" height="15" rx="3.5" fill={status === 'done' ? color : 'none'} stroke={color} strokeWidth="1.6" />
      {status === 'doing' && <path d="M9 3.5a5.5 5.5 0 0 1 0 11z" fill={color} />}
      {status === 'done' && <path d="M5 9.3l2.6 2.6L13 6.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

const createTodo = createReactBlockSpec(
  {
    type: 'todo',
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      status: { default: 'todo', values: TODO_ORDER },
    },
    content: 'inline',
  },
  {
    render: (props) => {
      const status = props.block.props.status as (typeof TODO_ORDER)[number]
      const next = TODO_ORDER[(TODO_ORDER.indexOf(status) + 1) % TODO_ORDER.length]
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%' }}>
          <button
            contentEditable={false}
            type="button"
            title={`${TODO_LABEL[status]} : clique pour passer à « ${TODO_LABEL[next]} »`}
            onClick={() => props.editor.updateBlock(props.block, { props: { status: next } } as never)}
            style={{ marginTop: 3, flexShrink: 0, cursor: 'pointer', background: 'none', border: 0, padding: 0 }}
          >
            <TodoBox status={status} />
          </button>
          <div ref={props.contentRef} style={{ flex: 1, textDecoration: status === 'done' ? 'line-through' : undefined, opacity: status === 'done' ? 0.55 : 1 }} />
          {status === 'doing' && (
            <span contentEditable={false} style={{ flexShrink: 0, marginTop: 3, borderRadius: 4, background: 'rgba(224,161,0,.18)', color: '#b07f00', padding: '0 6px', fontSize: 11, fontWeight: 600 }}>
              En cours
            </span>
          )}
        </div>
      )
    },
  },
)

// Bloc « Moodboard » : un moodboard complet dans un cadre de la page. C'est une vraie page moodboard
// (enfant de la page courante) : le bouton « Plein écran » l'ouvre dans l'espace entier.
function MoodboardFrame({ boardId, height, onResize }: { boardId: string; height: number; onResize: (h: number) => void }) {
  const board = useApp((s) => s.objects.find((o) => o.id === boardId))
  const select = useApp((s) => s.select)
  const [live, setLive] = useState<number | null>(null)
  const [name, setName] = useState(board?.title ?? '')
  useEffect(() => setName(board?.title ?? ''), [board?.title])
  if (!board || board.deleted_at) {
    return <div contentEditable={false} className="w-full rounded-md border border-dashed border-[var(--border)] p-4 text-sm text-[var(--fg-muted)]">Ce moodboard a été supprimé.</div>
  }
  // Poignée du bas : glisser pour agrandir ou réduire (hauteur mémorisée dans la page).
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const y0 = e.clientY
    const h0 = height
    const next = (ev: PointerEvent) => Math.max(160, Math.min(1600, Math.round(h0 + ev.clientY - y0)))
    const move = (ev: PointerEvent) => setLive(next(ev))
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setLive(null)
      onResize(next(ev))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const count = parseBoard(board.content).items.length
  const act = 'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--fg-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_9%,transparent)] hover:text-[var(--fg)]'
  return (
    <div contentEditable={false} className="group/mb w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-[var(--shadow-soft)]" style={{ position: 'relative', zIndex: 0, isolation: 'isolate' }}>
      {/* Bandeau : le nom du moodboard, son contenu, et à droite deux actions (elles se révèlent au survol) */}
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        {/* L'icône et le nom se changent ici même (comme ceux d'une page) */}
        <IconPicker value={board.icon} onChange={(icon) => void useApp.getState().update(board.id, { icon })} trigger={<Icon value={board.icon ?? '🖼️'} size={16} />} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() !== board.title) void useApp.getState().update(board.id, { title: name.trim() }) }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setName(board.title); (e.target as HTMLInputElement).blur() } }}
          placeholder="Moodboard"
          aria-label="Nom du moodboard"
          spellCheck={false}
          style={{ width: `${Math.min(40, Math.max(name.length, 9))}ch` }}
          className="min-w-0 max-w-full rounded bg-transparent text-sm font-semibold outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] focus:bg-transparent focus:underline focus:decoration-[var(--border)] focus:underline-offset-4"
        />
        {count > 0 && <span className="lib-count shrink-0">{`${count} élément${count > 1 ? 's' : ''}`}</span>}
        <div className="ml-auto flex items-center gap-0.5 rounded-xl bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] p-0.5 opacity-60 transition-opacity group-hover/mb:opacity-100">
          <button type="button" className={act} onClick={() => void openFloatingBoard(board.id, board.title)} title="Fenêtre flottante : ouvre ce moodboard dans une petite fenêtre toujours devant (Windows)"><PictureInPicture2 size={13} />Fenêtre flottante</button>
          <button type="button" className={act} onClick={() => select(board.id)} title="Ouvrir ce moodboard en pleine page"><Maximize2 size={13} />Pleine page</button>
        </div>
      </div>
      <div className="border-t border-[var(--border)]" style={{ height: live ?? height }}>
        <MoodboardView key={board.id} board={board} compact />
      </div>
      <div
        role="separator"
        aria-label="Glisser pour redimensionner"
        title="Glisser pour agrandir ou réduire"
        onPointerDown={startDrag}
        className="flex h-4 cursor-ns-resize items-center justify-center border-t border-[var(--border)] transition-colors hover:bg-[var(--bg-hover)]"
        style={{ touchAction: 'none' }}
      >
        <span className="h-1 w-10 rounded-full bg-[var(--border)]" />
      </div>
    </div>
  )
}

// Bloc « Base de données intégrée » : la vraie base (vues, filtres, tris, lignes) au milieu de la page.
function DatabaseFrame({ dbId }: { dbId: string }) {
  const db = useApp((s) => s.objects.find((o) => o.id === dbId))
  if (!db || db.deleted_at) {
    return <div contentEditable={false} className="w-full rounded-md border border-dashed border-[var(--border)] p-4 text-sm text-[var(--fg-muted)]">Cette base de données a été supprimée.</div>
  }
  return (
    <div contentEditable={false} className="w-full overflow-x-auto rounded-md border border-[var(--border)] px-3" style={{ position: 'relative', zIndex: 0, isolation: 'isolate' }}>
      <DatabaseView key={db.id} db={db} embedded />
    </div>
  )
}

const createDatabaseBlock = createReactBlockSpec(
  { type: 'database', propSchema: { dbId: { default: '' } }, content: 'none' },
  { render: (props) => <DatabaseFrame dbId={props.block.props.dbId} /> },
)

const createMoodboardBlock = createReactBlockSpec(
  {
    type: 'moodboard',
    propSchema: {
      boardId: { default: '' },
      height: { default: 440 },
    },
    content: 'none',
  },
  {
    render: (props) => (
      <MoodboardFrame
        boardId={props.block.props.boardId}
        height={props.block.props.height}
        onResize={(h) => props.editor.updateBlock(props.block, { props: { height: h } } as never)}
      />
    ),
  },
)

// Bloc « Page » : un lien vers une page enfant (page, base de données ou moodboard), comme dans Notion.
function SubpageLink({ pageId }: { pageId: string }) {
  const page = useApp((s) => s.objects.find((o) => o.id === pageId))
  const select = useApp((s) => s.select)
  if (!page || page.deleted_at) return <div contentEditable={false} className="text-sm text-[var(--fg-muted)]">Page supprimée</div>
  return (
    <button
      type="button"
      contentEditable={false}
      onClick={() => select(page.id)}
      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-[var(--bg-hover)]"
    >
      <Icon value={page.icon ?? (page.type === 'database' ? '📊' : page.type === 'moodboard' ? '🖼️' : '📄')} size={18} />
      <span className="font-medium underline decoration-[var(--border)] underline-offset-2">{page.title || 'Nouvelle page'}</span>
    </button>
  )
}

const createSubpageBlock = createReactBlockSpec(
  { type: 'subpage', propSchema: { pageId: { default: '' } }, content: 'none' },
  { render: (props) => <SubpageLink pageId={props.block.props.pageId} /> },
)

// Blocs « Aperçu de lien web » (signet) et « Intégrer » (YouTube, Spotify, Figma…).
const createBookmarkBlock = createReactBlockSpec(
  { type: 'bookmark', propSchema: { url: { default: '' }, title: { default: '' }, description: { default: '' }, site: { default: '' }, image: { default: '' } }, content: 'none' },
  { render: (props) => <BookmarkBlock props={props.block.props} update={(p) => props.editor.updateBlock(props.block, { props: p } as never)} /> },
)
const createEmbedBlock = createReactBlockSpec(
  { type: 'embed', propSchema: { url: { default: '' }, src: { default: '' }, provider: { default: '' }, height: { default: 405 } }, content: 'none' },
  { render: (props) => <EmbedBlock props={props.block.props} update={(p) => props.editor.updateBlock(props.block, { props: p } as never)} /> },
)

const createPageCardBlock = createReactBlockSpec(
  { type: 'pagecard', propSchema: { pageId: { default: '' } }, content: 'none' },
  { render: (props) => <PageCardBlock pageId={props.block.props.pageId} update={(id) => props.editor.updateBlock(props.block, { props: { pageId: id } } as never)} /> },
)

const createEquationBlock = createReactBlockSpec(
  { type: 'equation', propSchema: { latex: { default: '' } }, content: 'none' },
  { render: (props) => <EquationBlock latex={props.block.props.latex} update={(latex) => props.editor.updateBlock(props.block, { props: { latex } } as never)} /> },
)

type Ed = BlockNoteEditor<never, never, never>

// Bloc « Table des matières » : liste cliquable des titres de la page, mise à jour pendant la frappe.
type HeadingRef = { id: string; level: number; text: string }

function collectHeadings(blocks: unknown[], out: HeadingRef[] = []): HeadingRef[] {
  for (const b of blocks as { id: string; type: string; props?: { level?: number }; content?: unknown; children?: unknown[] }[]) {
    if (b.type === 'heading' && Array.isArray(b.content)) {
      const text = (b.content as { text?: string }[]).map((c) => c.text ?? '').join('').trim()
      if (text) out.push({ id: b.id, level: Math.min(b.props?.level ?? 1, 4), text })
    }
    if (b.children?.length) collectHeadings(b.children, out)
  }
  return out
}

function TableOfContents({ editor }: { editor: Ed }) {
  const [heads, setHeads] = useState<HeadingRef[]>(() => collectHeadings(editor.document))
  useEffect(() => editor.onChange(() => setHeads(collectHeadings(editor.document))), [editor])
  return (
    <nav contentEditable={false} aria-label="Table des matières" className="w-full py-1 text-sm">
      {heads.length === 0 && <div className="text-[var(--fg-muted)]">Ajoute des titres à la page : ils apparaîtront ici.</div>}
      {heads.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() => document.querySelector(`[data-id="${h.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="block w-full truncate rounded px-1 py-0.5 text-left text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
          style={{ paddingLeft: 4 + (h.level - 1) * 16 }}
        >
          {h.text}
        </button>
      ))}
    </nav>
  )
}

const createTocBlock = createReactBlockSpec(
  { type: 'toc', propSchema: {}, content: 'none' },
  { render: (props) => <TableOfContents editor={props.editor as unknown as Ed} /> },
)

// Mention « @ » : un lien vers une autre page, au milieu d'une phrase.
function MentionLink({ pageId }: { pageId: string }) {
  const page = useApp((s) => s.objects.find((o) => o.id === pageId))
  const select = useApp((s) => s.select)
  if (!page || page.deleted_at) return <span className="text-[var(--fg-muted)]">Page supprimée</span>
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => { e.preventDefault(); select(page.id) }}
      className="cursor-pointer rounded px-0.5 font-medium underline decoration-[var(--border)] underline-offset-2 hover:bg-[var(--bg-hover)]"
    >
      <Icon value={page.icon ?? (page.type === 'database' ? '📊' : page.type === 'moodboard' ? '🖼️' : '📄')} size={15} className="mr-1 align-text-bottom" />
      {page.title || 'Nouvelle page'}
    </span>
  )
}

const createMention = createReactInlineContentSpec(
  { type: 'mention', propSchema: { pageId: { default: '' } }, content: 'none' },
  { render: (props) => <MentionLink pageId={props.inlineContent.props.pageId} /> },
)

const schema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: { ...defaultBlockSpecs, callout: createCallout(), todo: createTodo(), moodboard: createMoodboardBlock(), subpage: createSubpageBlock(), toc: createTocBlock(), database: createDatabaseBlock(), portions: createPortionsBlock(), recipephoto: createRecipePhotoBlock(), bookmark: createBookmarkBlock(), embed: createEmbedBlock(), pagecard: createPageCardBlock(), equation: createEquationBlock() },
    inlineContentSpecs: { ...defaultInlineContentSpecs, mention: createMention },
  }),
)

/** Pictogramme « T dans un carré arrondi » de l'encadré, comme dans Notion. */
function CalloutGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8.5 9V8h7v1M12 8v8M10.5 16h3" />
    </svg>
  )
}

type Cur = { id: string; content?: unknown }

/** Le bloc où l'on vient de taper « / » (à relever tout de suite, avant tout travail asynchrone). */
const cursorBlock = (editor: Ed) => editor.getTextCursorPosition().block as unknown as Cur

/** Remplace la ligne vide où l'on vient de taper « / » par le bloc choisi, sinon l'insère juste après. */
function putBlock(editor: Ed, block: Record<string, unknown>, at: Cur = cursorBlock(editor)) {
  const empty = Array.isArray(at.content) && at.content.length === 0
  if (empty) editor.updateBlock(at as never, block as never)
  else editor.insertBlocks([block as never], at as never, 'after')
  // Un bloc sans texte (moodboard, page...) ne doit pas rester le dernier : on garde une ligne libre dessous.
  const last = editor.document[editor.document.length - 1] as { type: string }
  if (last.type !== 'paragraph') editor.insertBlocks([{ type: 'paragraph' } as never], last as never, 'after')
}

/** Comme putBlock, pour plusieurs blocs d'un coup : le premier remplace la ligne vide, les autres suivent. */
function putBlocks(editor: Ed, blocks: unknown[], at: Cur = cursorBlock(editor)) {
  const [first, ...rest] = blocks as Record<string, unknown>[]
  const empty = Array.isArray(at.content) && at.content.length === 0
  let anchor: Cur = at
  if (empty) editor.updateBlock(at as never, first as never)
  else anchor = editor.insertBlocks([first as never], at as never, 'after')[0] as unknown as Cur
  if (rest.length) editor.insertBlocks(rest as never, anchor as never, 'after')
  const last = editor.document[editor.document.length - 1] as { type: string }
  if (last.type !== 'paragraph') editor.insertBlocks([{ type: 'paragraph' } as never], last as never, 'after')
}

const columns = (n: number) => ({
  type: 'columnList',
  children: Array.from({ length: n }, () => ({ type: 'column', props: { width: 1 }, children: [{ type: 'paragraph' }] })),
})

const SLASH_DESCRIPTIONS: Record<string, string> = {
  paragraph: 'Écris du texte, tout simplement.',
  h1: 'Titre de grande taille.', h2: 'Titre de taille moyenne.', h3: 'Titre de petite taille.', h4: 'Titre de très petite taille.',
  bullet: 'Une liste à puces.', numbered: 'Une liste numérotée.', check: 'Une liste de cases à cocher.', todo: 'Une tâche avec un statut (à faire, en cours, fait).',
  toggle: 'Un menu qui se déplie et se replie.', subpage: 'Une page à l’intérieur de cette page.', callout: 'Un encadré pour mettre une info en avant.',
  quote: 'Une citation.', table: 'Un tableau simple.', divider: 'Une ligne pour séparer.', code: 'Un bloc de code.',
  th1: 'Un titre grand format qui déplie son contenu.', th2: 'Un titre moyen qui déplie son contenu.', th3: 'Un petit titre qui déplie son contenu.',
  c2: 'Deux blocs côte à côte.', c3: 'Trois blocs côte à côte.', c4: 'Quatre blocs côte à côte.', c5: 'Cinq blocs côte à côte.',
  image: 'Ajoute une image.', video: 'Ajoute un fichier vidéo.', audio: 'Ajoute un fichier audio.', file: 'Joins un fichier à la page.',
  toc: 'Les titres de la page, cliquables.', today: 'Insère la date du jour.', tomorrow: 'Insère la date de demain.', yesterday: 'Insère la date d’hier.', now: 'Insère la date et l’heure.',
}

function buildSlashItems(editor: Ed, pageId: string | null): SlashItem[] {
  const defaults = getDefaultReactSlashMenuItems(editor as never) as unknown as { key: string; badge?: string; onItemClick: () => void }[]
  const std = (key: string) => defaults.find((d) => d.key === key)
  const ico = (I: LucideIcon) => <I size={18} strokeWidth={1.75} />
  const put = (block: Record<string, unknown>) => () => putBlock(editor, block)
  const viaDefault = (key: string) => () => std(key)?.onItemClick()
  const embed = (kind: 'page' | 'database' | 'moodboard', blockType: 'moodboard' | 'subpage' | 'database') => () => {
    const at = cursorBlock(editor)
    void useApp.getState().createEmbeddedChild(pageId, kind).then((id) => {
      if (id) putBlock(editor, { type: blockType, props: blockType === 'moodboard' ? { boardId: id } : blockType === 'database' ? { dbId: id } : { pageId: id } }, at)
    })
  }
  const B = 'Blocs de base'
  const M = 'Médias'
  const mod = (k: string) => std(k)?.badge
  const items: SlashItem[] = [
    { key: 'paragraph', title: 'Texte', aliases: ['texte', 'paragraphe', 'text'], group: B, icon: ico(Type), badge: mod('paragraph'), onItemClick: viaDefault('paragraph') },
    { key: 'h1', title: 'Titre 1', aliases: ['titre', 'h1', 'heading'], group: B, icon: ico(Heading1), badge: '#', onItemClick: put({ type: 'heading', props: { level: 1 } }) },
    { key: 'h2', title: 'Titre 2', aliases: ['titre', 'h2'], group: B, icon: ico(Heading2), badge: '##', onItemClick: put({ type: 'heading', props: { level: 2 } }) },
    { key: 'h3', title: 'Titre 3', aliases: ['titre', 'h3'], group: B, icon: ico(Heading3), badge: '###', onItemClick: put({ type: 'heading', props: { level: 3 } }) },
    { key: 'h4', title: 'Titre 4', aliases: ['titre', 'h4'], group: B, icon: ico(Heading4), badge: '####', onItemClick: put({ type: 'heading', props: { level: 4 } }) },
    { key: 'bullet', title: 'Liste à puces', aliases: ['liste', 'puces', 'bullet'], group: B, icon: ico(List), badge: '-', onItemClick: viaDefault('bullet_list') },
    { key: 'numbered', title: 'Liste numérotée', aliases: ['liste', 'numérotée', 'numerotee', 'numbered'], group: B, icon: ico(ListOrdered), badge: '1.', onItemClick: viaDefault('numbered_list') },
    { key: 'check', title: 'Liste de tâches', aliases: ['tâches', 'taches', 'cases', 'cocher', 'todo'], group: B, icon: ico(ListChecks), badge: '[]', onItemClick: viaDefault('check_list') },
    { key: 'todo', title: 'Tâche avec statut', aliases: ['tâche', 'tache', 'todo', 'en cours', 'statut', 'progression'], group: B, icon: ico(CircleDot), onItemClick: put({ type: 'todo' }) },
    { key: 'toggle', title: 'Menu déroulant', aliases: ['déroulant', 'deroulant', 'toggle', 'repliable', 'dépliant'], group: B, icon: ico(ListCollapse), badge: '>', onItemClick: viaDefault('toggle_list') },
    { key: 'subpage', title: 'Page', aliases: ['page', 'sous-page', 'nouvelle page'], group: B, icon: ico(FileText), onItemClick: embed('page', 'subpage') },
    { key: 'callout', title: 'Encadré', aliases: ['encadré', 'encadre', 'callout', 'note', 'info'], group: B, icon: <CalloutGlyph />, onItemClick: put({ type: 'callout' }) },
    { key: 'quote', title: 'Citation', aliases: ['citation', 'quote', 'extrait'], group: B, icon: ico(QuoteIcon), badge: '"', onItemClick: viaDefault('quote') },
    { key: 'table', title: 'Tableau', aliases: ['tableau', 'table'], group: B, icon: ico(TableIcon), onItemClick: viaDefault('table') },
    { key: 'divider', title: 'Séparateur', aliases: ['séparateur', 'separateur', 'diviseur', 'ligne', 'divider'], group: B, icon: ico(Minus), badge: '---', onItemClick: viaDefault('divider') },
    { key: 'code', title: 'Code', aliases: ['code', 'bloc de code'], group: B, icon: ico(Code), badge: '```', onItemClick: viaDefault('code_block') },
    { key: 'th1', title: 'Titre déroulant 1', aliases: ['titre', 'déroulant', 'toggle', 'repliable'], group: B, icon: ico(Heading1), badge: '# >', onItemClick: put({ type: 'heading', props: { level: 1, isToggleable: true } }) },
    { key: 'th2', title: 'Titre déroulant 2', aliases: ['titre', 'déroulant', 'toggle', 'repliable'], group: B, icon: ico(Heading2), badge: '## >', onItemClick: put({ type: 'heading', props: { level: 2, isToggleable: true } }) },
    { key: 'th3', title: 'Titre déroulant 3', aliases: ['titre', 'déroulant', 'toggle', 'repliable'], group: B, icon: ico(Heading3), badge: '### >', onItemClick: put({ type: 'heading', props: { level: 3, isToggleable: true } }) },
    { key: 'c2', title: '2 colonnes', aliases: ['colonnes', 'colonne'], group: B, icon: ico(Columns2), onItemClick: put(columns(2)) },
    { key: 'c3', title: '3 colonnes', aliases: ['colonnes', 'colonne'], group: B, icon: ico(Columns3), onItemClick: put(columns(3)) },
    { key: 'c4', title: '4 colonnes', aliases: ['colonnes', 'colonne'], group: B, icon: ico(Columns4), onItemClick: put(columns(4)) },
    { key: 'c5', title: '5 colonnes', aliases: ['colonnes', 'colonne'], group: B, icon: ico(Columns4), onItemClick: put(columns(5)) },
    { key: 'bookmark', title: 'Aperçu de lien web', aliases: ['lien', 'aperçu', 'apercu', 'signet', 'bookmark', 'site', 'url'], group: M, subtext: 'Une carte avec le titre, la description et l’image d’un site', icon: ico(Globe), onItemClick: put({ type: 'bookmark' }) },
    { key: 'embed', title: 'Intégrer', aliases: ['intégrer', 'integrer', 'embed', 'youtube', 'vimeo', 'spotify', 'figma', 'loom', 'maps', 'carte', 'vidéo en ligne'], group: M, subtext: 'YouTube, Vimeo, Spotify, Figma, Loom, Google Maps', icon: ico(Link2), onItemClick: put({ type: 'embed' }) },
    { key: 'pagecard', title: 'Carte de page', aliases: ['page', 'carte', 'aperçu', 'apercu', 'lien', 'lier'], group: 'Blocs avancés', subtext: 'Un aperçu d’une autre page (titre et début du texte)', icon: ico(FileText), onItemClick: put({ type: 'pagecard' }) },
    { key: 'equation', title: 'Équation', aliases: ['équation', 'equation', 'formule', 'latex', 'maths', 'math'], group: 'Blocs avancés', subtext: 'Une formule de maths écrite en LaTeX', icon: ico(Sigma), onItemClick: put({ type: 'equation' }) },
    { key: 'image', title: 'Image', aliases: ['image', 'photo', 'img'], group: M, icon: ico(ImageIcon), onItemClick: viaDefault('image') },
    { key: 'video', title: 'Vidéo', aliases: ['vidéo', 'video'], group: M, icon: ico(Video), onItemClick: viaDefault('video') },
    { key: 'audio', title: 'Audio', aliases: ['audio', 'son', 'musique'], group: M, icon: ico(Volume2), onItemClick: viaDefault('audio') },
    { key: 'file', title: 'Fichier', aliases: ['fichier', 'file', 'pièce jointe'], group: M, icon: ico(Paperclip), onItemClick: viaDefault('file') },
    {
      key: 'recipe', title: 'Recette', aliases: ['recette', 'cuisine', 'plat', 'ingrédients', 'ingredients', 'gâteau', 'gateau'], group: 'Cuisine',
      subtext: 'Nom, photo, nombre de personnes, ingrédients, étapes', icon: ico(ChefHat),
      onItemClick: () => {
        const at = cursorBlock(editor)
        const st = useApp.getState()
        const page = st.objects.find((o) => o.id === pageId)
        void (st.repo?.getSetting('recipe_people') ?? Promise.resolve(null)).then((raw) => {
          const people = Math.max(1, parseInt(raw ?? '', 10) || 4)
          putBlocks(editor, recipeSlashBlocks({ people, withName: !page?.title.trim() }), at)
        })
      },
    },
    { key: 'portions', title: 'Nombre de personnes', aliases: ['personnes', 'portions', 'quantités', 'quantites', 'recette'], group: 'Cuisine', subtext: 'Recalcule les quantités des ingrédients', icon: ico(Users), onItemClick: put({ type: 'portions' }) },
    { key: 'toc', title: 'Table des matières', aliases: ['table', 'matières', 'matieres', 'sommaire', 'toc', 'plan'], group: 'Blocs avancés', icon: ico(ListTree), onItemClick: put({ type: 'toc' }) },
    { key: 'moodboard', title: 'Moodboard', aliases: ['moodboard', 'mood board', 'planche', 'inspiration', 'cadre', 'images'], group: M, subtext: 'Un moodboard dans un cadre, ouvrable en pleine page', icon: ico(Images), onItemClick: embed('moodboard', 'moodboard') },
    { key: 'dbinline', title: 'Base de données – Intégrée', aliases: ['base', 'données', 'donnees', 'database', 'table', 'tableau', 'intégrée', 'integree', 'kanban', 'calendrier', 'galerie'], group: 'Base de données', subtext: 'Une base de données dans la page (tableau, kanban, calendrier...)', icon: ico(Database), onItemClick: embed('database', 'database') },
    { key: 'db', title: 'Base de données – Pleine page', aliases: ['base', 'données', 'donnees', 'database', 'table', 'tableau'], group: 'Base de données', icon: ico(Database), onItemClick: embed('database', 'subpage') },
    { key: 'today', title: 'Aujourd’hui', aliases: ['date', 'aujourd’hui', 'aujourdhui', 'today', 'jour'], group: 'Dates', icon: ico(CalendarDays), onItemClick: () => editor.insertInlineContent([dateText(new Date(), 0) + ' '] as never) },
    { key: 'tomorrow', title: 'Demain', aliases: ['date', 'demain', 'tomorrow'], group: 'Dates', icon: ico(CalendarDays), onItemClick: () => editor.insertInlineContent([dateText(new Date(), 1) + ' '] as never) },
    { key: 'yesterday', title: 'Hier', aliases: ['date', 'hier', 'yesterday'], group: 'Dates', icon: ico(CalendarDays), onItemClick: () => editor.insertInlineContent([dateText(new Date(), -1) + ' '] as never) },
    { key: 'now', title: 'Maintenant', aliases: ['date', 'heure', 'maintenant', 'now'], group: 'Dates', icon: ico(CalendarDays), onItemClick: () => editor.insertInlineContent([dateTimeText(new Date()) + ' '] as never) },
  ]
  return items.map((it) => ({ ...it, subtext: it.subtext ?? SLASH_DESCRIPTIONS[it.key] }))
}

/** Pages proposées après « @ » (recherche sans accents, 10 résultats). */
function mentionItems(editor: Ed, currentId: string | null, query: string): SlashItem[] {
  const q = normalize(query)
  return useApp.getState().objects
    .filter((o) => (o.type === 'page' || o.type === 'database' || o.type === 'moodboard') && !o.deleted_at && !isSystemDatabase(o) && o.id !== currentId)
    .filter((o) => normalize(o.title || 'Nouvelle page').includes(q))
    .slice(0, 10)
    .map((o) => ({
      key: o.id,
      title: o.title || 'Nouvelle page',
      group: 'Lier à une page',
      icon: <Icon value={o.icon ?? (o.type === 'database' ? '📊' : o.type === 'moodboard' ? '🖼️' : '📄')} size={18} />,
      onItemClick: () => editor.insertInlineContent([{ type: 'mention', props: { pageId: o.id } }, ' '] as never),
    }))
}

export function PageEditor({ pageId, initial, onChange, editorRef, editable = true, plain = false }: { pageId?: string; editable?: boolean; /** Sans le « + » ni la poignée à gauche des blocs : juste du texte, comme dans Notion (notes rapides). */ plain?: boolean; initial: string | null; onChange: (json: string) => void; editorRef?: React.MutableRefObject<BlockNoteEditor<never, never, never> | null> }) {
  const theme = useApp((s) => s.theme)

  // Un lien collé seul sur une ligne vide : il reste un lien, et un petit menu propose l'aperçu ou l'intégration (comme dans Notion).
  const [pasted, setPasted] = useState<{ url: string; blockId: string; x: number; y: number } | null>(null)
  const editor = useCreateBlockNote({
    schema,
    pasteHandler: ({ event, editor: ed, defaultPasteHandler }) => {
      const text = event.clipboardData?.getData('text/plain')?.trim() ?? ''
      const block = ed.getTextCursorPosition().block as unknown as { id: string; type: string; content?: unknown }
      if (isUrl(text) && block.type === 'paragraph' && Array.isArray(block.content) && block.content.length === 0 && !event.clipboardData?.types.includes('Files')) {
        event.preventDefault()
        ed.insertInlineContent([{ type: 'link', href: text, content: text } as never])
        requestAnimationFrame(() => {
          const r = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).getBoundingClientRect() : null
          setPasted({ url: text, blockId: block.id, x: r?.left ?? 200, y: r?.bottom ?? 200 })
        })
        return true
      }
      return defaultPasteHandler()
    },
    dictionary: { ...fr, multi_column: multiColumnLocales.fr, placeholders: { ...fr.placeholders, default: EMPTY_LINE_HINT } },
    dropCursor: multiColumnDropCursor,
    // Les images sont enregistrées directement dans la base : tout reste local et sauvegardé.
    uploadFile: readFileAsDataUrl,
    // Les photos rangées dans la bibliothèque (dossier « recettes ») sont retrouvées à partir du dossier choisi.
    resolveFileUrl: resolveForEditor,
    initialContent: parseContent(initial) as never,
  })
  if (editorRef) editorRef.current = editor as unknown as BlockNoteEditor<never, never, never>

  // Sélection de blocs « façon Notion » : surlignage dessiné par-dessus (l'éditeur réécrit lui-même ses éléments), recalculé au défilement.
  const selKey = pageId ?? 'page'
  const selAnchor = useBlockSel((s) => (s.pageId === selKey ? s.anchor : null))
  const selFocus = useBlockSel((s) => (s.pageId === selKey ? s.focus : null))
  const [selRects, setSelRects] = useState<{ left: number; top: number; width: number; height: number }[]>([])
  useLayoutEffect(() => {
    if (!selAnchor || !selFocus) {
      setSelRects([])
      return
    }
    const compute = () => {
      const ids = rangeIds(flatten(editor.document as unknown as BlockLike[]), selAnchor, selFocus)
      setSelRects(ids.flatMap((id) => {
        const content = document.querySelector<HTMLElement>(`.bn-block-outer[data-id="${id}"]`)?.querySelector<HTMLElement>(':scope > .bn-block > .bn-block-content')
        if (!content) return []
        const b = content.getBoundingClientRect()
        return [selectionBox(b)]
      }))
    }
    compute()
    window.addEventListener('scroll', compute, true)
    window.addEventListener('resize', compute)
    // Un bloc déplacé ou un texte qui change de hauteur : le surlignage suit.
    const off = (editor as unknown as BlockNoteEditor<never, never, never>).onChange(() => requestAnimationFrame(compute))
    return () => {
      window.removeEventListener('scroll', compute, true)
      window.removeEventListener('resize', compute)
      off?.()
    }
  }, [selAnchor, selFocus, editor])

  /** Remplace la ligne du lien collé par un bloc (aperçu ou intégration), en gardant une ligne libre dessous. */
  const turnInto = (block: Record<string, unknown>) => {
    if (!pasted || !editor.getBlock(pasted.blockId)) return
    editor.replaceBlocks([pasted.blockId], [block as never])
    const last = editor.document[editor.document.length - 1] as { type: string }
    if (last.type !== 'paragraph') editor.insertBlocks([{ type: 'paragraph' } as never], last as never, 'after')
  }

  /**
   * Touches de la sélection de blocs (comme dans Notion). Échap sélectionne le bloc du curseur ; ensuite ↑/↓ changent de bloc, Maj+↑/↓ étendent,
   * Entrée revient au texte, Suppr / Retour arrière efface les blocs, Ctrl+D les duplique, Ctrl+C / Ctrl+X les copient. Toute autre touche quitte ce mode.
   * Rend vrai quand la touche a été traitée ici.
   */
  const blockSelectionKey = (e: React.KeyboardEvent): boolean => {
    const sel = useBlockSel.getState()
    const ed = editor as unknown as BlockNoteEditor<never, never, never>
    const ctrl = e.ctrlKey || e.metaKey
    const stop = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    // Ctrl+Maj+↑/↓ avec des blocs sélectionnés : ils montent ou descendent ensemble. (Sans sélection, l'éditeur déplace déjà le bloc du curseur.)
    if (ctrl && e.shiftKey && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && sel.pageId === selKey && sel.anchor && sel.focus) {
      stop()
      try {
        const picked = rangeIds(flatten(ed.document as unknown as BlockLike[]), sel.anchor, sel.focus)
        ed.setSelection(picked[0] as never, picked[picked.length - 1] as never)
        if (e.key === 'ArrowUp') ed.moveBlocksUp()
        else ed.moveBlocksDown()
      } catch (err) { console.warn('[blocs] déplacement impossible', err) }
      return true
    }    if (sel.pageId !== selKey || !sel.anchor || !sel.focus) {
      // Raccourcis de Notion sur le bloc du curseur : Ctrl+D (dupliquer), Alt+Maj+L (copier le lien du bloc), Ctrl+Maj+H (dernière couleur utilisée).
      const isLetter = (letter: string) => e.key.toLowerCase() === letter
      const onBlock = (action: (block: { id: string; props?: Record<string, unknown> }) => void) => {
        try {
          action(ed.getTextCursorPosition().block as unknown as { id: string; props?: Record<string, unknown> })
          stop()
          return true
        } catch {
          return false
        }
      }
      if (ctrl && !e.shiftKey && !e.altKey && isLetter('d')) {
        return onBlock((b) => {
          ed.insertBlocks([strippedCopy(ed.getBlock(b.id as never) as never)] as never, b.id as never, 'after')
        })
      }
      if (e.altKey && e.shiftKey && !ctrl && isLetter('l') && pageId) {
        return onBlock((b) => {
          void copyText(blockLink(pageId, b.id)).then(() => {
            useApp.setState({ toast: 'Lien du bloc copié.' })
            window.setTimeout(() => useApp.setState({ toast: null }), 2500)
          })
        })
      }
      if (ctrl && e.shiftKey && !e.altKey && isLetter('h')) {
        return onBlock((b) => {
          const recent = loadRecentColor()
          ed.updateBlock(b.id as never, { props: { [colorProp(recent.kind)]: nextColor(String(b.props?.[colorProp(recent.kind)] ?? 'default'), recent) } } as never)
        })
      }      // Échap dans le texte (et pas dans un menu ouvert) : le bloc du curseur est sélectionné.
      if (e.key === 'Escape' && !ctrl && !e.shiftKey && !e.altKey && !document.querySelector('[role="listbox"]')) {
        try {
          const block = ed.getTextCursorPosition().block as { id: string }
          sel.set(selKey, block.id, block.id)
          stop()
          return true
        } catch { /* pas de curseur dans l'éditeur */ }
      }
      return false
    }
    const { anchor, focus } = sel
    const order = flatten(ed.document as unknown as BlockLike[])
    const ids = rangeIds(order, anchor, focus)
    if (e.key === 'Escape') {
      stop()
      sel.clear()
      return true
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      stop()
      const next = neighbour(order, focus, e.key === 'ArrowUp' ? -1 : 1)
      sel.set(selKey, e.shiftKey ? anchor : next, next)
      document.querySelector<HTMLElement>(`.bn-block-outer[data-id="${next}"]`)?.scrollIntoView({ block: 'nearest' })
      return true
    }
    if (e.key === 'Enter') {
      stop()
      sel.clear()
      ed.setTextCursorPosition(focus as never, 'end')
      return true
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      stop()
      const target = afterRemoval(order, ids)
      sel.clear()
      ed.removeBlocks(ids as never)
      if (target) {
        try { ed.setTextCursorPosition(target as never, 'end') } catch { /* le bloc n'existe plus */ }
      }
      return true
    }
    if (ctrl && e.key.toLowerCase() === 'd') {
      stop()
      // Les blocs dont le parent est déjà choisi sont copiés avec lui : on ne garde que les plus hauts.
      const top = ids.filter((id) => {
        const parent = ed.getParentBlock(id as never) as { id: string } | undefined
        return !parent || !ids.includes(parent.id)
      })
      const copies = top.map((id) => ed.getBlock(id as never)).filter((b): b is NonNullable<typeof b> => !!b).map((b) => withoutIds(b as unknown as { id?: string; children?: unknown[] }))
      sel.clear()
      if (copies.length > 0) ed.insertBlocks(copies as never, ids[ids.length - 1] as never, 'after')
      return true
    }
    if (ctrl && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
      // La copie se fait par la sélection de l'éditeur ; on la pose sur ces blocs, puis la touche suit son cours.
      try { ed.setSelection(ids[0] as never, ids[ids.length - 1] as never) } catch { /* sélection impossible */ }
      if (e.key.toLowerCase() === 'x') window.setTimeout(() => sel.clear(), 0)
      return false
    }
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return false
    // Toute autre touche : on quitte la sélection de blocs (la frappe continue dans le texte).
    sel.clear()
    return false
  }

  // Tab et Maj+Tab gardent le comportement de Notion (décaler le bloc sous le précédent / le ramener) : c'est celui de l'éditeur.
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (!editable || e.nativeEvent.isComposing) return
    const el = e.target as HTMLElement
    if (!el.closest('.bn-editor') || el.closest('input, textarea, select, [role="menu"], [role="listbox"]')) return
    blockSelectionKey(e)
  }
  return (
    <div className="contents" onKeyDownCapture={onKeyDownCapture} onPointerDownCapture={() => useBlockSel.getState().clear()}>
      {selRects.map((b, i) => (
        <div key={i} className="pointer-events-none fixed z-20 rounded-md" style={{ ...b, background: SELECTION_FILL }} />
      ))}
    <BlockNoteView
      editor={editor}
      theme={theme}
      slashMenu={false}
      sideMenu={false}
      editable={editable}
      onChange={() => onChange(JSON.stringify(editor.document))}
    >
      {!plain && <SideMenuController sideMenu={(sideProps) => <SideMenu {...sideProps} dragHandleMenu={BlockMenu} />} />}
      <SuggestionMenuController
        triggerCharacter="/"
        suggestionMenuComponent={SlashMenu as never}
        getItems={async (query) => filterSuggestionItems(buildSlashItems(editor as never, pageId ?? null) as never, query) as never}
      />
      <SuggestionMenuController
        triggerCharacter="@"
        suggestionMenuComponent={SlashMenu as never}
        getItems={async (query) => mentionItems(editor as never, pageId ?? null, query) as never}
      />
    </BlockNoteView>
    {pasted && (
      <PasteLinkMenu
        url={pasted.url}
        x={pasted.x}
        y={pasted.y}
        onClose={() => setPasted(null)}
        onKeep={() => setPasted(null)}
        onPreview={() => { turnInto({ type: 'bookmark', props: { url: pasted.url } }); setPasted(null) }}
        onEmbed={() => {
          const info = embedFor(pasted.url)
          if (info) turnInto({ type: 'embed', props: { url: pasted.url, src: info.src, provider: info.provider, height: info.height } })
          setPasted(null)
        }}
      />
    )}
    </div>
  )
}
