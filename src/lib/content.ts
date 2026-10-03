/** Convertit le contenu enregistré en liste de blocs pour l'éditeur. */
export function parseContent(content: string | null): unknown[] | undefined {
  if (!content) return undefined
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    return undefined
  }
  // Format actuel : liste de blocs BlockNote.
  if (Array.isArray(data)) return data.length > 0 ? data : undefined
  // Ancien format de la phase 0 : {"text": "..."} -> un paragraphe par ligne.
  if (data && typeof data === 'object' && typeof (data as { text?: unknown }).text === 'string') {
    const text = (data as { text: string }).text
    if (text.trim() === '') return undefined
    return text.split('\n').map((line) => ({ type: 'paragraph', content: line }))
  }
  return undefined
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
