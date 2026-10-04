import { useMemo } from 'react'
import { SideMenuExtension } from '@blocknote/core/extensions'
import {
  BlockColorsItem,
  DragHandleMenu,
  RemoveBlockItem,
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
  usePortalElement,
} from '@blocknote/react'
import { Copy, Link2, RefreshCw, Smile, Palette } from 'lucide-react'
import { blockLink, countWords, strippedCopy } from '@/lib/blocks'
import { copyText } from '@/lib/windowActions'
import { useApp } from '@/store/app'

const TURN_INTO: { label: string; type: string; props?: Record<string, unknown> }[] = [
  { label: 'Texte', type: 'paragraph' },
  { label: 'Titre 1', type: 'heading', props: { level: 1 } },
  { label: 'Titre 2', type: 'heading', props: { level: 2 } },
  { label: 'Titre 3', type: 'heading', props: { level: 3 } },
  { label: 'Liste à puces', type: 'bulletListItem' },
  { label: 'Liste numérotée', type: 'numberedListItem' },
  { label: 'Liste de tâches', type: 'checkListItem' },
  { label: 'Tâche avec statut', type: 'todo' },
  { label: 'Menu déroulant', type: 'toggleListItem' },
  { label: 'Citation', type: 'quote' },
  { label: 'Encadré', type: 'callout' },
]

const TYPE_NAMES: Record<string, string> = {
  paragraph: 'Texte', heading: 'Titre', bulletListItem: 'Liste à puces', numberedListItem: 'Liste numérotée', checkListItem: 'Liste de tâches',
  toggleListItem: 'Menu déroulant', quote: 'Citation', callout: 'Encadré', todo: 'Tâche avec statut', codeBlock: 'Code', image: 'Image',
  table: 'Tableau', moodboard: 'Moodboard', database: 'Base de données', subpage: 'Page', toc: 'Table des matières',
}

/** Menu de la poignée ⋮⋮ d'un bloc, comme Notion : transformer, couleur, icône, lien, dupliquer, supprimer. */
export function BlockMenu() {
  const c = useComponentsContext()
  const editor = useBlockNoteEditor()
  const portal = usePortalElement()
  const block = useExtensionState(SideMenuExtension, { editor, selector: (s: { block?: unknown } | undefined) => s?.block }) as
    | { id: string; type: string; content?: unknown }
    | undefined
  const pageId = useApp((s) => s.selectedId)

  const stats = useMemo(() => countWords(editor.document as never), [editor, block?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!c || !block) return null

  const hasText = Array.isArray(block.content)
  const Item = c.Generic.Menu.Item

  return (
    <DragHandleMenu>
      <div className="px-3 pb-1 pt-2 text-xs font-medium text-[var(--fg-muted)]">{TYPE_NAMES[block.type] ?? 'Bloc'}</div>

      {hasText && (
        <c.Generic.Menu.Root position="right" sub portalElement={portal}>
          <c.Generic.Menu.Trigger sub>
            <Item className="bn-menu-item" subTrigger icon={<RefreshCw size={16} />}>Transformer en</Item>
          </c.Generic.Menu.Trigger>
          <c.Generic.Menu.Dropdown sub className="bn-menu-dropdown">
            {TURN_INTO.filter((t) => t.type !== block.type || t.type === 'heading').map((t) => (
              <Item key={t.label} className="bn-menu-item" onClick={() => editor.updateBlock(block as never, { type: t.type, props: t.props ?? {} } as never)}>
                {t.label}
              </Item>
            ))}
          </c.Generic.Menu.Dropdown>
        </c.Generic.Menu.Root>
      )}

      <BlockColorsItem><span className="flex items-center gap-2"><Palette size={16} />Couleur</span></BlockColorsItem>

      {block.type === 'callout' && (
        <Item
          className="bn-menu-item"
          icon={<Smile size={16} />}
          onClick={() => window.setTimeout(() => document.querySelector<HTMLElement>(`[data-id="${block.id}"] [data-callout-icon]`)?.click(), 50)}
        >
          Modifier l’icône
        </Item>
      )}

      <c.Generic.Menu.Divider />
      <Item
        className="bn-menu-item"
        icon={<Link2 size={16} />}
        onClick={() => {
          if (pageId) void copyText(blockLink(pageId, block.id)).then(() => useApp.setState({ toast: 'Lien du bloc copié.' }))
          window.setTimeout(() => useApp.setState({ toast: null }), 2500)
        }}
      >
        Copier le lien du bloc
      </Item>
      <Item
        className="bn-menu-item"
        icon={<Copy size={16} />}
        onClick={() => editor.insertBlocks([strippedCopy(editor.getBlock(block.id) as never)] as never, block as never, 'after')}
      >
        Dupliquer
      </Item>
      <RemoveBlockItem>Supprimer</RemoveBlockItem>

      <c.Generic.Menu.Divider />
      <div className="px-3 py-1.5 text-xs text-[var(--fg-muted)]">
        {stats.words} mot{stats.words > 1 ? 's' : ''}, {stats.chars} caractère{stats.chars > 1 ? 's' : ''}
      </div>
    </DragHandleMenu>
  )
}
