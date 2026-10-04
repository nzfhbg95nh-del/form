import { BlockNoteSchema, defaultBlockSpecs, defaultProps, filterSuggestionItems, type BlockNoteEditor } from '@blocknote/core'
import { fr } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/mantine'
import {
  createReactBlockSpec,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react'
import {
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
  multiColumnDropCursor,
  withMultiColumn,
} from '@blocknote/xl-multi-column'
import '@blocknote/mantine/style.css'
import { Icon } from '@/components/Icon'
import { MoodboardView } from '@/components/MoodboardView'
import { parseContent, readFileAsDataUrl } from '@/lib/content'
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
function MoodboardFrame({ boardId, tall, onToggleTall }: { boardId: string; tall: boolean; onToggleTall: () => void }) {
  const board = useApp((s) => s.objects.find((o) => o.id === boardId))
  const select = useApp((s) => s.select)
  const frame = 'rounded px-2 py-0.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]'
  if (!board || board.deleted_at) {
    return <div contentEditable={false} className="w-full rounded-md border border-dashed border-[var(--border)] p-4 text-sm text-[var(--fg-muted)]">Ce moodboard a été supprimé.</div>
  }
  return (
    <div contentEditable={false} className="w-full overflow-hidden rounded-md border border-[var(--border)]">
      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-side)] px-2 py-1 text-sm">
        <Icon value={board.icon ?? '🖼️'} size={14} />
        <span className="flex-1 truncate font-medium">{board.title || 'Moodboard'}</span>
        <button type="button" className={frame} onClick={onToggleTall}>{tall ? 'Réduire' : 'Agrandir'}</button>
        <button type="button" className={frame} onClick={() => select(board.id)}>Ouvrir en pleine page ↗</button>
      </div>
      <div style={{ height: tall ? 760 : 440 }}>
        <MoodboardView key={board.id} board={board} />
      </div>
    </div>
  )
}

const createMoodboardBlock = createReactBlockSpec(
  {
    type: 'moodboard',
    propSchema: {
      boardId: { default: '' },
      tall: { default: false },
    },
    content: 'none',
  },
  {
    render: (props) => (
      <MoodboardFrame
        boardId={props.block.props.boardId}
        tall={props.block.props.tall}
        onToggleTall={() => props.editor.updateBlock(props.block, { props: { tall: !props.block.props.tall } } as never)}
      />
    ),
  },
)

const schema = withMultiColumn(
  BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, callout: createCallout(), todo: createTodo(), moodboard: createMoodboardBlock() } }),
)

/** Remplace la ligne vide où l'on vient de taper « / » par le bloc choisi, sinon l'insère juste après. */
function putBlock(editor: BlockNoteEditor<never, never, never>, block: Record<string, unknown>) {
  const current = editor.getTextCursorPosition().block as { content?: unknown }
  const empty = Array.isArray(current.content) && current.content.length === 0
  if (empty) editor.updateBlock(current as never, block as never)
  else editor.insertBlocks([block as never], current as never, 'after')
}

export function PageEditor({ pageId, initial, onChange, editorRef }: { pageId?: string; initial: string | null; onChange: (json: string) => void; editorRef?: React.MutableRefObject<BlockNoteEditor<never, never, never> | null> }) {
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
      onChange={() => onChange(JSON.stringify(editor.document))}
    >
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            [
              ...getDefaultReactSlashMenuItems(editor),
              ...getMultiColumnSlashMenuItems(editor),
              {
                title: 'Callout',
                aliases: ['callout', 'encadré', 'note', 'info'],
                group: 'Autres',
                subtext: 'Une phrase mise en avant',
                onItemClick: () => putBlock(editor as never, { type: 'callout' }),
              },
              {
                title: 'Moodboard',
                aliases: ['moodboard', 'mood board', 'planche', 'inspiration', 'cadre', 'tableau', 'images'],
                group: 'Médias',
                subtext: 'Un moodboard dans un cadre (ouvrable en pleine page)',
                onItemClick: () => {
                  void useApp.getState().createEmbeddedMoodboard(pageId ?? null).then((id) => {
                    if (id) putBlock(editor as never, { type: 'moodboard', props: { boardId: id } })
                  })
                },
              },
              {
                title: 'Tâche avec statut',
                aliases: ['tâche', 'tache', 'todo', 'en cours', 'statut', 'progression'],
                group: 'Blocs de base',
                subtext: 'À faire, en cours ou fait (clique sur la case)',
                onItemClick: () => putBlock(editor as never, { type: 'todo' }),
              },
            ],
            query,
          )
        }
      />
    </BlockNoteView>
  )
}
