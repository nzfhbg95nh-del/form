// Glisser « maison » des blocs de l'éditeur, comme dans Notion.
//
// Pourquoi : le glisser intégré au navigateur (celui de BlockNote) bloque la molette sous Windows tant qu'on tient la souris, et ne fait
// presque pas défiler la page au bord de l'écran. Ici, on empêche ce glisser-là de démarrer et on suit la souris nous-mêmes ; à chaque
// mouvement on envoie à l'éditeur les mêmes signaux qu'un vrai glisser (dragstart, dragover, drop, dragend), avec un « presse-papiers de
// glisser » à nous. Toute la logique de dépôt de BlockNote (entre deux blocs, en colonnes, vers la barre latérale) reste donc la même,
// mais la molette marche et la page défile toute seule près des bords.

import { edgeScrollSpeed } from './dragScroll.ts'

/** Distance (en pixels) à parcourir, souris enfoncée, avant que le glisser commence (sinon c'est un simple clic). */
const START_DISTANCE = 4

/** Les éléments qu'on fait glisser à notre façon : la poignée ⋮⋮ des blocs, et les images des pages (prises directement). */
export function isBlockDragSource(el: Element | null): HTMLElement | null {
  if (!el) return null
  const handle = el.closest<HTMLElement>('.bn-side-menu [draggable="true"]')
  if (handle) return handle
  const img = el.closest<HTMLImageElement>('img[draggable="true"]')
  if (img && img.closest('.bn-editor .bn-block-content[data-content-type="image"]')) return img
  return null
}

interface Drag {
  source: HTMLElement
  data: DataTransfer
  x: number
  y: number
  altKey: boolean
  ctrlKey: boolean
  ghost: HTMLElement | null
  scroller: HTMLElement
  frame: number
  lastOver: Element | null
}

let installs = 0
let uninstall: (() => void) | null = null

/** Branche le glisser maison (une seule fois, même si plusieurs éditeurs sont ouverts). Rend la fonction qui le débranche. */
export function installPointerDrag(): () => void {
  installs++
  if (installs === 1) uninstall = install()
  return () => {
    installs--
    if (installs === 0) {
      uninstall?.()
      uninstall = null
    }
  }
}

/** La zone qui défile autour de l'éditeur (la page), ou le document. */
function scrollerOf(el: Element): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p)
    if (/(auto|scroll|overlay)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement
}

function fire(type: string, target: EventTarget, d: Pick<Drag, 'data' | 'x' | 'y' | 'altKey' | 'ctrlKey'>): boolean {
  const ev = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: d.x,
    clientY: d.y,
    screenX: d.x,
    screenY: d.y,
    // Alt + glisser (copie, comme dans Notion) est géré par Form au « dragstart » : on transmet seulement les touches telles quelles.
    altKey: d.altKey,
    ctrlKey: d.ctrlKey,
    dataTransfer: d.data,
  })
  return target.dispatchEvent(ev)
}

function install(): () => void {
  let pending: { source: HTMLElement; x: number; y: number } | null = null
  let drag: Drag | null = null

  const under = (x: number, y: number) => document.elementFromPoint(x, y)

  const over = () => {
    if (!drag) return
    const target = under(drag.x, drag.y)
    if (!target) return
    // Le bloc survolé change : l'ancien reçoit « dragleave » (les zones de dépôt de la barre latérale s'éteignent).
    if (drag.lastOver && drag.lastOver !== target && !drag.lastOver.contains(target)) fire('dragleave', drag.lastOver, drag)
    if (drag.lastOver !== target) fire('dragenter', target, drag)
    drag.lastOver = target
    fire('dragover', target, drag)
  }

  const moveGhost = () => {
    if (!drag?.ghost) return
    drag.ghost.style.transform = `translate(${drag.x + 14}px, ${drag.y + 6}px)`
  }

  // Défilement automatique près des bords, image après image, tant qu'on tient le bloc.
  const tick = () => {
    if (!drag) return
    const box = drag.scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : drag.scroller.getBoundingClientRect()
    const speed = edgeScrollSpeed(drag.y, Math.max(0, box.top), Math.min(window.innerHeight, box.bottom))
    if (speed !== 0) {
      const before = drag.scroller.scrollTop
      drag.scroller.scrollTop = before + speed
      if (drag.scroller.scrollTop !== before) over()
    }
    drag.frame = requestAnimationFrame(tick)
  }

  const makeGhost = (): HTMLElement | null => {
    // BlockNote prépare une copie du bloc pour l'aperçu du glisser : on la montre sous la souris.
    const preview = document.querySelector<HTMLElement>('.bn-drag-preview')
    if (!preview) return null
    const ghost = preview.cloneNode(true) as HTMLElement
    ghost.classList.remove('bn-drag-preview')
    ghost.setAttribute('data-drag-ghost', '')
    Object.assign(ghost.style, {
      position: 'fixed', left: '0', top: '0', zIndex: '10000', pointerEvents: 'none', opacity: '0.55',
      maxWidth: '560px', maxHeight: '320px', overflow: 'hidden', padding: '2px 6px', borderRadius: '6px',
      background: 'var(--bg, #fff)', boxShadow: '0 6px 20px rgba(0,0,0,.18)',
    })
    document.body.appendChild(ghost)
    return ghost
  }

  const begin = (e: PointerEvent) => {
    if (!pending) return
    const data = new DataTransfer()
    const d = { data, x: e.clientX, y: e.clientY, altKey: e.altKey, ctrlKey: e.ctrlKey }
    // Le bloc (ou l'image) reçoit son « dragstart » : BlockNote prépare le bloc à déplacer, Form ses options (Alt = copie, barre latérale).
    fire('dragstart', pending.source, d)
    if (!data.types.includes('blocknote/html')) {
      // Rien à glisser (bloc introuvable) : on abandonne proprement.
      fire('dragend', pending.source, d)
      pending = null
      return
    }
    drag = { source: pending.source, ...d, ghost: makeGhost(), scroller: scrollerOf(pending.source.closest('.bn-container') ?? pending.source), frame: 0, lastOver: null }
    pending = null
    window.getSelection()?.removeAllRanges()
    document.documentElement.classList.add('form-block-dragging')
    moveGhost()
    over()
    drag.frame = requestAnimationFrame(tick)
  }

  const finish = (drop: boolean) => {
    const d = drag
    if (!d) return
    drag = null
    cancelAnimationFrame(d.frame)
    d.ghost?.remove()
    document.documentElement.classList.remove('form-block-dragging')
    const target = under(d.x, d.y)
    if (drop && target) fire('drop', target, d)
    else if (d.lastOver) fire('dragleave', d.lastOver, d)
    // La source peut avoir disparu de la page (bloc déplacé) : « dragend » part alors du document.
    fire('dragend', d.source.isConnected ? d.source : document, d)
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || e.pointerType === 'touch') return
    const source = isBlockDragSource(e.target as Element)
    pending = source ? { source, x: e.clientX, y: e.clientY } : null
  }

  // Le glisser intégré du navigateur ne démarre pas : c'est nous qui le faisons (seulement pour nos sources).
  const onNativeDragStart = (e: DragEvent) => {
    if (!e.isTrusted) return
    if (pending && (e.target === pending.source || pending.source.contains(e.target as Node))) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (drag) {
      drag.x = e.clientX
      drag.y = e.clientY
      drag.altKey = e.altKey
      moveGhost()
      over()
      return
    }
    if (pending && (e.buttons & 1) === 1 && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) >= START_DISTANCE) begin(e)
  }

  const onPointerUp = () => {
    pending = null
    if (drag) finish(true)
  }

  // La molette fait défiler la page : le point de dépôt suit.
  const onScroll = () => { if (drag) over() }
  const onKey = (e: KeyboardEvent) => {
    if (drag && e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finish(false)
    }
  }
  const onCancel = () => { pending = null; if (drag) finish(false) }

  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('dragstart', onNativeDragStart, true)
  window.addEventListener('pointermove', onPointerMove, true)
  window.addEventListener('pointerup', onPointerUp, true)
  window.addEventListener('pointercancel', onCancel, true)
  window.addEventListener('blur', onCancel)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('keydown', onKey, true)
  return () => {
    onCancel()
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('dragstart', onNativeDragStart, true)
    window.removeEventListener('pointermove', onPointerMove, true)
    window.removeEventListener('pointerup', onPointerUp, true)
    window.removeEventListener('pointercancel', onCancel, true)
    window.removeEventListener('blur', onCancel)
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('keydown', onKey, true)
  }
}
