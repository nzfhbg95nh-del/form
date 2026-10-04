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

const schema = withMultiColumn(
  BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, callout: createCallout(), todo: createTodo() } }),
)

/** Remplace la ligne vide où l'on vient de taper « / » par le bloc choisi, sinon l'insère juste après. */
function putBlock(editor: BlockNoteEditor<never, never, never>, block: Record<string, unknown>) {
  const current = editor.getTextCursorPosition().block as { content?: unknown }
  const empty = Array.isArray(current.content) && current.content.length === 0
  if (empty) editor.updateBlock(current as never, block as never)
  else editor.insertBlocks([block as never], current as never, 'after')
}

export function PageEditor({ initial, onChange, editorRef }: { initial: string | null; onChange: (json: string) => void; editorRef?: React.MutableRefObject<BlockNoteEditor<never, never, never> | null> }) {
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
