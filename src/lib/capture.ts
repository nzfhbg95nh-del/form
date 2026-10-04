/** Découpe un texte de capture rapide : la première ligne devient le titre, le reste le contenu. */
export function splitCapture(text: string): { title: string; blocks: unknown[] } {
  const lines = text.replace(/\r/g, '').split('\n')
  const first = (lines.find((l) => l.trim() !== '') ?? '').trim()
  const title = first.length > 80 ? first.slice(0, 80).trimEnd() + '…' : first
  const rest = lines.slice(lines.findIndex((l) => l.trim() !== '') + 1)
  const blocks: unknown[] = rest.map((l) => ({ type: 'paragraph', content: l }))
  // Un titre tronqué est conservé en entier dans le contenu.
  if (first.length > 80) blocks.unshift({ type: 'paragraph', content: first })
  return { title, blocks }
}
