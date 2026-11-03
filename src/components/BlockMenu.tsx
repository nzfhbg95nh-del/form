import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SideMenuExtension } from '@blocknote/core/extensions'
import { DragHandleMenu, useBlockNoteEditor, useComponentsContext, useExtensionState, usePortalElement } from '@blocknote/react'
import {
  CircleCheck, Code, Copy, CornerUpRight, Heading1, Heading2, Heading3, Heading4, Info, Link2, List, ListChecks, ListCollapse, ListOrdered, Palette, Quote, RefreshCw, Search, Smile, Trash2, Type,
} from 'lucide-react'
import {
  BACKGROUND_FILL, COLOR_IDS, colorLabel, colorProp, KINDS, kindOf, loadRecentColor, saveRecentColor, TEXT_INK, type ColorId, type ColorKind, type RecentColor,
} from '@/lib/blockKinds'
import { appendBlockToContent, blockLink, countWords, strippedCopy } from '@/lib/blocks'
import { copyText } from '@/lib/windowActions'
import { useApp } from '@/store/app'
import { useBlockMove } from '@/store/blockMove'

const KIND_ICONS: Record<string, ReactNode> = {
  text: <Type size={16} />, h1: <Heading1 size={16} />, h2: <Heading2 size={16} />, h3: <Heading3 size={16} />, h4: <Heading4 size={16} />,
  bullet: <List size={16} />, numbered: <ListOrdered size={16} />, check: <ListChecks size={16} />, todo: <CircleCheck size={16} />, toggle: <ListCollapse size={16} />,
  code: <Code size={16} />, quote: <Quote size={16} />, callout: <Info size={16} />,
  th1: <Heading1 size={16} />, th2: <Heading2 size={16} />, th3: <Heading3 size={16} />, th4: <Heading4 size={16} />,
}

/** Les types qui ne sont pas dans « Transformer en » mais qu'on sait nommer. */
const OTHER_NAMES: Record<string, string> = {
  image: 'Image', table: 'Tableau', moodboard: 'Moodboard', database: 'Base de données', subpage: 'Page', toc: 'Table des matières', breadcrumb: 'Fil d’Ariane', button: 'Bouton', equation: 'Équation', video: 'Vidéo', audio: 'Audio', file: 'Fichier',
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** La pastille d'une couleur : un « A » de cette couleur (texte) ou un carré de cette couleur (fond). */
function Swatch({ kind, color }: { kind: ColorKind; color: ColorId }) {
  return kind === 'text' ? (
    <span className="flex h-5 w-5 items-center justify-center rounded border text-xs font-semibold" style={{ color: TEXT_INK[color], borderColor: 'var(--border)' }}>A</span>
  ) : (
    <span className="h-5 w-5 rounded border" style={{ background: BACKGROUND_FILL[color], borderColor: 'var(--border)' }} />
  )
}

/** Un nom d'action avec, à droite, son raccourci clavier. */
function WithShortcut({ children, shortcut }: { children: ReactNode; shortcut?: string }) {
  return (
    <span className="flex w-full items-center gap-3">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="shrink-0 text-xs text-[var(--fg-muted)]">{shortcut}</span>}
    </span>
  )
}

/** Menu de la poignée ⋮⋮ d'un bloc, comme Notion : recherche d'actions, transformer en, couleur, lien, dupliquer, supprimer. */
export function BlockMenu() {
  const c = useComponentsContext()
  const editor = useBlockNoteEditor()
  const portal = usePortalElement()
  const block = useExtensionState(SideMenuExtension, { editor, selector: (s: { block?: unknown } | undefined) => s?.block }) as
    | { id: string; type: string; props?: Record<string, unknown>; content?: unknown }
    | undefined
  const pageId = useApp((s) => s.selectedId)
  const updatedAt = useApp((s) => s.objects.find((o) => o.id === s.selectedId)?.updated_at)
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<RecentColor>(loadRecentColor)
  // Le curseur arrive dans le champ de recherche dès l'ouverture du menu (le menu reprend lui-même le focus un instant après : on le lui redonne).
  const searchInput = useRef<HTMLInputElement>(null)
  const showing = !!block
  useEffect(() => {
    if (!showing) return
    const timer = window.setTimeout(() => searchInput.current?.focus(), 40)
    return () => window.clearTimeout(timer)
  }, [showing])

  const stats = useMemo(() => countWords(editor.document as never), [editor, block?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!c || !block) return null

  const Item = c.Generic.Menu.Item
  const hasText = Array.isArray(block.content)
  const current = kindOf(block)
  const canText = !!block.props && 'textColor' in block.props
  const canBackground = !!block.props && 'backgroundColor' in block.props
  const currentColor = (kind: ColorKind) => String(block.props?.[colorProp(kind)] ?? 'default')

  const say = (message: string) => {
    useApp.setState({ toast: message })
    window.setTimeout(() => useApp.setState({ toast: null }), 2500)
  }
  const turnInto = (id: string) => {
    const kind = KINDS.find((k) => k.id === id)
    if (kind) editor.updateBlock(block as never, { type: kind.type, props: kind.props ?? {} } as never)
  }
  const paint = (kind: ColorKind, color: ColorId) => {
    editor.updateBlock(block as never, { props: { [colorProp(kind)]: color } } as never)
    const next = { kind, color }
    saveRecentColor(next)
    setRecent(next)
  }
  const copyLink = () => {
    if (pageId) void copyText(blockLink(pageId, block.id)).then(() => say('Lien du bloc copié.'))
  }
  const duplicate = () => editor.insertBlocks([strippedCopy(editor.getBlock(block.id) as never)] as never, block as never, 'after')
  const remove = () => editor.removeBlocks([block as never])
  // Comme dans Notion : « Déplacer vers » une autre page. Le bloc (et ses sous-blocs) part à la fin de la page choisie, puis disparaît de celle-ci.
  const moveToPage = () => {
    const source = editor.getBlock(block.id)
    if (!source) return
    useBlockMove.getState().ask(pageId, async (targetId) => {
      const target = useApp.getState().objects.find((o) => o.id === targetId)
      if (!target) return
      await useApp.getState().update(targetId, { content: appendBlockToContent(target.content, source as never) })
      editor.removeBlocks([block.id] as never)
      say(`Bloc déplacé vers « ${target.title || 'Nouvelle page'} ».`)
    })
  }
  const blockStats = countWords([block as never])

  const typeName = current?.label ?? OTHER_NAMES[block.type] ?? 'Bloc'
  const modified = updatedAt ? new Date(updatedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null

  // Recherche d'actions : une liste à plat de tout ce que le menu sait faire.
  const q = fold(query.trim())
  const searchable: { key: string; label: string; icon: ReactNode; checked?: boolean; run: () => void }[] = [
    ...(hasText ? KINDS.map((k) => ({ key: `kind-${k.id}`, label: `Transformer en ${k.label}`, icon: KIND_ICONS[k.id], checked: current?.id === k.id, run: () => turnInto(k.id) })) : []),
    ...(canText ? COLOR_IDS.map((id) => ({ key: `text-${id}`, label: colorLabel('text', id), icon: <Swatch kind="text" color={id} />, checked: currentColor('text') === id, run: () => paint('text', id) })) : []),
    ...(canBackground ? COLOR_IDS.map((id) => ({ key: `bg-${id}`, label: colorLabel('background', id), icon: <Swatch kind="background" color={id} />, checked: currentColor('background') === id, run: () => paint('background', id) })) : []),
    { key: 'link', label: 'Copier le lien du bloc', icon: <Link2 size={16} />, run: copyLink },
    { key: 'dup', label: 'Dupliquer', icon: <Copy size={16} />, run: duplicate },
    { key: 'move', label: 'Déplacer vers une page…', icon: <CornerUpRight size={16} />, run: moveToPage },
    { key: 'del', label: 'Supprimer', icon: <Trash2 size={16} />, run: remove },
  ]
  const results = q ? searchable.filter((a) => fold(a.label).includes(q)) : []

  const sectionLabel = (text: string) => <div className="px-3 pb-1 pt-2 text-xs font-semibold text-[var(--fg-muted)]">{text}</div>
  const colorItem = (kind: ColorKind, id: ColorId, key: string) => (
    <Item key={key} className="bn-menu-item" icon={<Swatch kind={kind} color={id} />} checked={currentColor(kind) === id} onClick={() => paint(kind, id)}>
      {colorLabel(kind, id)}
    </Item>
  )

  return (
    <DragHandleMenu>
      <div className="px-2 pb-1 pt-2">
        <label className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: 'color-mix(in srgb, var(--fg) 6%, transparent)' }}>
          <Search size={14} className="shrink-0" style={{ color: 'var(--fg-muted)' }} />
          <input
            ref={searchInput}
            autoFocus
            value={query}
            placeholder="Rechercher des actions…"
            aria-label="Rechercher des actions"
            onChange={(e) => setQuery(e.target.value)}
            // Les flèches et la frappe restent dans le champ (sinon le menu les prend pour une navigation) ; Échap ferme le menu comme d'habitude.
            onKeyDown={(e) => {
              if (e.key !== 'Escape') e.stopPropagation()
            }}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-muted)]"
          />
        </label>
      </div>

      {q ? (
        results.length === 0 ? (
          <div className="px-3 py-3 text-sm text-[var(--fg-muted)]">Aucune action</div>
        ) : (
          results.map((a) => (
            <Item key={a.key} className="bn-menu-item" icon={a.icon} checked={a.checked} onClick={a.run}>{a.label}</Item>
          ))
        )
      ) : (
        <>
          <div className="px-3 pb-1 pt-1 text-xs font-medium text-[var(--fg-muted)]">{typeName}</div>

          {hasText && (
            <c.Generic.Menu.Root position="right" sub portalElement={portal}>
              <c.Generic.Menu.Trigger sub>
                <Item className="bn-menu-item" subTrigger icon={<RefreshCw size={16} />}>Transformer en</Item>
              </c.Generic.Menu.Trigger>
              <c.Generic.Menu.Dropdown sub className="bn-menu-dropdown">
                {KINDS.map((k) => (
                  <Item key={k.id} className="bn-menu-item" icon={KIND_ICONS[k.id]} checked={current?.id === k.id} onClick={() => turnInto(k.id)}>{k.label}</Item>
                ))}
              </c.Generic.Menu.Dropdown>
            </c.Generic.Menu.Root>
          )}

          {(canText || canBackground) && (
            <c.Generic.Menu.Root position="right" sub portalElement={portal}>
              <c.Generic.Menu.Trigger sub>
                <Item className="bn-menu-item" subTrigger icon={<Palette size={16} />}>Couleur</Item>
              </c.Generic.Menu.Trigger>
              <c.Generic.Menu.Dropdown sub className="bn-menu-dropdown">
                {sectionLabel('Utilisé dernièrement')}
                <Item
                  className="bn-menu-item"
                  icon={<Swatch kind={recent.kind} color={recent.color} />}
                  checked={currentColor(recent.kind) === recent.color}
                  onClick={() => paint(recent.kind, recent.color)}
                >
                  <WithShortcut shortcut="Ctrl+⇧+H">{colorLabel(recent.kind, recent.color)}</WithShortcut>
                </Item>
                {canText && (
                  <>
                    <c.Generic.Menu.Divider />
                    {sectionLabel('Couleur du texte')}
                    {COLOR_IDS.map((id) => colorItem('text', id, `t-${id}`))}
                  </>
                )}
                {canBackground && (
                  <>
                    <c.Generic.Menu.Divider />
                    {sectionLabel("Couleur d'arrière-plan")}
                    {COLOR_IDS.map((id) => colorItem('background', id, `b-${id}`))}
                  </>
                )}
              </c.Generic.Menu.Dropdown>
            </c.Generic.Menu.Root>
          )}

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
          <Item className="bn-menu-item" icon={<Link2 size={16} />} onClick={copyLink}><WithShortcut shortcut="Alt+⇧+L">Copier le lien du bloc</WithShortcut></Item>
          <Item className="bn-menu-item" icon={<Copy size={16} />} onClick={duplicate}><WithShortcut shortcut="Ctrl+D">Dupliquer</WithShortcut></Item>
          <Item className="bn-menu-item" icon={<CornerUpRight size={16} />} onClick={moveToPage}>Déplacer vers une page…</Item>
          <Item className="bn-menu-item" icon={<Trash2 size={16} />} onClick={remove}><WithShortcut shortcut="Suppr">Supprimer</WithShortcut></Item>

          <c.Generic.Menu.Divider />
          <div className="px-3 pb-2 pt-1 text-xs text-[var(--fg-muted)]">
            <div className="mb-0.5 font-semibold">Date de modification</div>
            {modified && <div>{modified}</div>}
            {hasText && <div>Ce bloc : {blockStats.words} mot{blockStats.words > 1 ? 's' : ''}, {blockStats.chars} caractère{blockStats.chars > 1 ? 's' : ''}</div>}
            <div>La page : {stats.words} mot{stats.words > 1 ? 's' : ''}, {stats.chars} caractère{stats.chars > 1 ? 's' : ''}</div>
          </div>
        </>
      )}
    </DragHandleMenu>
  )
}
