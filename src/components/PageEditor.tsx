import { useEffect, useState } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, defaultProps, filterSuggestionItems, type BlockNoteEditor } from '@blocknote/core'
import { fr } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/mantine'
import {
  createReactBlockSpec,
  createReactInlineContentSpec,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react'
import {
  locales as multiColumnLocales,
  multiColumnDropCursor,
  withMultiColumn,
} from '@blocknote/xl-multi-column'
import '@blocknote/mantine/style.css'
import {
  CircleDot, Code, Columns2, Columns3, Columns4, Database, FileText, Heading1, Heading2, Heading3, Heading4, Image as ImageIcon, Images, Lightbulb, List,
  ListChecks, ListCollapse, ListOrdered, ListTree, Minus, Paperclip, Quote as QuoteIcon, Table as TableIcon, Type, Video, Volume2, type LucideIcon,
} from 'lucide-react'
import { Icon } from '@/components/Icon'
import { SlashMenu, type SlashItem } from '@/components/SlashMenu'
import { DatabaseView } from '@/components/DatabaseView'
import { MoodboardView } from '@/components/MoodboardView'
import { parseContent, readFileAsDataUrl } from '@/lib/content'
import { normalize } from '@/lib/search'
import { isSystemDatabase } from '@/lib/database'
import { useApp } from '@/store/app'

// Bloc « Callout » : une phrase mise en avant dans un encadré avec un emoji.
const createCallout = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      emoji: { default: '💡' },
    },
    content: 'inline',
  },
  {
    render: (props) => (
      <div
        style={{
          display: 'flex',
          gap: 8,
          width: '100%',
          padding: '12px 14px',
          borderRadius: 6,
          background: 'var(--bg-hover)',
        }}
      >
        <span contentEditable={false}>{props.block.props.emoji}</span>
        <div ref={props.contentRef} style={{ flex: 1 }} />
      </div>
    ),
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
  const frame = 'rounded px-2 py-0.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]'
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
  return (
    <div contentEditable={false} className="w-full overflow-hidden rounded-md border border-[var(--border)]" style={{ position: 'relative', zIndex: 0, isolation: 'isolate' }}>
      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-side)] px-2 py-1 text-sm">
        <Icon value={board.icon ?? '🖼️'} size={14} />
        <span className="flex-1 truncate font-medium">{board.title || 'Moodboard'}</span>
        <button type="button" className={frame} onClick={() => select(board.id)}>Ouvrir en pleine page ↗</button>
      </div>
      <div style={{ height: live ?? height }}>
        <MoodboardView key={board.id} board={board} compact />
      </div>
      <div
        role="separator"
        aria-label="Glisser pour redimensionner"
        title="Glisser pour agrandir ou réduire"
        onPointerDown={startDrag}
        className="flex h-3 cursor-ns-resize items-center justify-center border-t border-[var(--border)] bg-[var(--bg-side)] hover:bg-[var(--bg-hover)]"
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
      <span className="font-medium underline decoration-[var(--border)] underline-offset-2">{page.title || 'Sans titre'}</span>
    </button>
  )
}

const createSubpageBlock = createReactBlockSpec(
  { type: 'subpage', propSchema: { pageId: { default: '' } }, content: 'none' },
  { render: (props) => <SubpageLink pageId={props.block.props.pageId} /> },
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
      {page.title || 'Sans titre'}
    </span>
  )
}

const createMention = createReactInlineContentSpec(
  { type: 'mention', propSchema: { pageId: { default: '' } }, content: 'none' },
  { render: (props) => <MentionLink pageId={props.inlineContent.props.pageId} /> },
)

const schema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: { ...defaultBlockSpecs, callout: createCallout(), todo: createTodo(), moodboard: createMoodboardBlock(), subpage: createSubpageBlock(), toc: createTocBlock(), database: createDatabaseBlock() },
    inlineContentSpecs: { ...defaultInlineContentSpecs, mention: createMention },
  }),
)

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

const columns = (n: number) => ({
  type: 'columnList',
  children: Array.from({ length: n }, () => ({ type: 'column', props: { width: 1 }, children: [{ type: 'paragraph' }] })),
})

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
  return [
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
    { key: 'callout', title: 'Encadré', aliases: ['encadré', 'encadre', 'callout', 'note', 'info'], group: B, icon: ico(Lightbulb), onItemClick: put({ type: 'callout' }) },
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
    { key: 'image', title: 'Image', aliases: ['image', 'photo', 'img'], group: M, icon: ico(ImageIcon), onItemClick: viaDefault('image') },
    { key: 'video', title: 'Vidéo', aliases: ['vidéo', 'video'], group: M, icon: ico(Video), onItemClick: viaDefault('video') },
    { key: 'audio', title: 'Audio', aliases: ['audio', 'son', 'musique'], group: M, icon: ico(Volume2), onItemClick: viaDefault('audio') },
    { key: 'file', title: 'Fichier', aliases: ['fichier', 'file', 'pièce jointe'], group: M, icon: ico(Paperclip), onItemClick: viaDefault('file') },
    { key: 'toc', title: 'Table des matières', aliases: ['table', 'matières', 'matieres', 'sommaire', 'toc', 'plan'], group: 'Blocs avancés', icon: ico(ListTree), onItemClick: put({ type: 'toc' }) },
    { key: 'moodboard', title: 'Moodboard', aliases: ['moodboard', 'mood board', 'planche', 'inspiration', 'cadre', 'images'], group: M, subtext: 'Un moodboard dans un cadre, ouvrable en pleine page', icon: ico(Images), onItemClick: embed('moodboard', 'moodboard') },
    { key: 'dbinline', title: 'Base de données – Intégrée', aliases: ['base', 'données', 'donnees', 'database', 'table', 'tableau', 'intégrée', 'integree', 'kanban', 'calendrier', 'galerie'], group: 'Base de données', subtext: 'Une base de données dans la page (tableau, kanban, calendrier...)', icon: ico(Database), onItemClick: embed('database', 'database') },
    { key: 'db', title: 'Base de données – Pleine page', aliases: ['base', 'données', 'donnees', 'database', 'table', 'tableau'], group: 'Base de données', icon: ico(Database), onItemClick: embed('database', 'subpage') },
  ]
}

/** Pages proposées après « @ » (recherche sans accents, 10 résultats). */
function mentionItems(editor: Ed, currentId: string | null, query: string): SlashItem[] {
  const q = normalize(query)
  return useApp.getState().objects
    .filter((o) => (o.type === 'page' || o.type === 'database' || o.type === 'moodboard') && !o.deleted_at && !isSystemDatabase(o) && o.id !== currentId)
    .filter((o) => normalize(o.title || 'Sans titre').includes(q))
    .slice(0, 10)
    .map((o) => ({
      key: o.id,
      title: o.title || 'Sans titre',
      group: 'Lier à une page',
      icon: <Icon value={o.icon ?? (o.type === 'database' ? '📊' : o.type === 'moodboard' ? '🖼️' : '📄')} size={18} />,
      onItemClick: () => editor.insertInlineContent([{ type: 'mention', props: { pageId: o.id } }, ' '] as never),
    }))
}

export function PageEditor({ pageId, initial, onChange, editorRef, editable = true }: { pageId?: string; editable?: boolean; initial: string | null; onChange: (json: string) => void; editorRef?: React.MutableRefObject<BlockNoteEditor<never, never, never> | null> }) {
  const theme = useApp((s) => s.theme)

  const editor = useCreateBlockNote({
    schema,
    dictionary: { ...fr, multi_column: multiColumnLocales.fr },
    dropCursor: multiColumnDropCursor,
    // Les images sont enregistrées directement dans la base : tout reste local et sauvegardé.
    uploadFile: readFileAsDataUrl,
    initialContent: parseContent(initial) as never,
  })
  if (editorRef) editorRef.current = editor as unknown as BlockNoteEditor<never, never, never>

  return (
    <BlockNoteView
      editor={editor}
      theme={theme}
      slashMenu={false}
      editable={editable}
      onChange={() => onChange(JSON.stringify(editor.document))}
    >
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
  )
}
