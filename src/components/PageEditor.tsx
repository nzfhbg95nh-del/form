import { BlockNoteSchema, defaultBlockSpecs, defaultProps, filterSuggestionItems } from '@blocknote/core'
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

const schema = withMultiColumn(
  BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, callout: createCallout() } }),
)

export function PageEditor({ initial, onChange }: { initial: string | null; onChange: (json: string) => void }) {
  const theme = useApp((s) => s.theme)

  const editor = useCreateBlockNote({
    schema,
    dictionary: { ...fr, multi_column: multiColumnLocales.fr },
    dropCursor: multiColumnDropCursor,
    // Les images sont enregistrées directement dans la base : tout reste local et sauvegardé.
    uploadFile: readFileAsDataUrl,
    initialContent: parseContent(initial) as never,
  })

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
                onItemClick: () => {
                  const current = editor.getTextCursorPosition().block
                  editor.insertBlocks([{ type: 'callout' } as never], current, 'after')
                },
              },
            ],
            query,
          )
        }
      />
    </BlockNoteView>
  )
}
