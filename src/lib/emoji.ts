import { normalize } from './search'

export interface EmojiItem {
  hexcode: string
  label: string
  unicode: string
  tags: string[]
  group: number
  order: number
  /** Variantes de teinte de peau, de la plus claire (1) à la plus foncée (5). */
  skins?: { unicode: string }[]
}

export interface EmojiGroup {
  key: string
  label: string
  items: EmojiItem[]
}

/** Les catégories affichées, dans l'ordre, avec le nom français et l'emoji qui sert de raccourci. */
export const GROUPS: { id: number; key: string; label: string; icon: string }[] = [
  { id: 0, key: 'smileys', label: 'Smileys et émotions', icon: '😀' },
  { id: 1, key: 'people', label: 'Personnes et corps', icon: '👋' },
  { id: 3, key: 'nature', label: 'Animaux et nature', icon: '🌿' },
  { id: 4, key: 'food', label: 'Nourriture et boissons', icon: '🥕' },
  { id: 6, key: 'activities', label: 'Activités', icon: '⚽' },
  { id: 5, key: 'travel', label: 'Voyages et lieux', icon: '✈️' },
  { id: 7, key: 'objects', label: 'Objets', icon: '💡' },
  { id: 8, key: 'symbols', label: 'Symboles', icon: '✅' },
  { id: 9, key: 'flags', label: 'Drapeaux', icon: '🏳️' },
]

export function groupEmojis(all: EmojiItem[]): EmojiGroup[] {
  return GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    items: all.filter((e) => e.group === g.id).sort((a, b) => a.order - b.order),
  })).filter((g) => g.items.length > 0)
}

/** Recherche en français, sans accents ni majuscules : tous les mots doivent se retrouver dans le nom ou les mots-clés. */
/** Comme `normalize`, avec « œ » -> « oe » (on tape « coeur » pour « cœur »). */
const fold = (text: string) => normalize(text).replace(/œ/g, 'oe').replace(/æ/g, 'ae')

export function searchEmojis(all: EmojiItem[], query: string, limit = 120): EmojiItem[] {
  const tokens = fold(query).trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  const scored: { item: EmojiItem; score: number }[] = []
  for (const item of all) {
    if (item.group === undefined || item.group === 2) continue
    const label = fold(item.label)
    const haystack = `${label} ${item.tags.map(fold).join(' ')}`
    if (!tokens.every((t) => haystack.includes(t))) continue
    scored.push({ item, score: tokens.every((t) => label.split(/[\s'’-]+/).some((w) => w.startsWith(t))) ? 0 : tokens.every((t) => label.includes(t)) ? 1 : 2 })
  }
  return scored.sort((a, b) => a.score - b.score || a.item.order - b.item.order).slice(0, limit).map((s) => s.item)
}

/** L'emoji avec la teinte de peau choisie (0 = jaune par défaut), s'il en a une. */
export function withSkin(item: EmojiItem, tone: number): string {
  return tone > 0 && item.skins?.[tone - 1] ? item.skins[tone - 1].unicode : item.unicode
}

export const SKIN_TONES = ['👋', '👋🏻', '👋🏼', '👋🏽', '👋🏾', '👋🏿']

/** Nom du fichier image d'un emoji : codes Unicode en minuscules séparés par des tirets (« 1f468-200d-1f4bb »). */
export function imageName(emoji: string): string {
  return Array.from(emoji).map((c) => c.codePointAt(0)!.toString(16).padStart(4, '0')).join('-')
}

/** Même nom sans le sélecteur de présentation FE0F (certains fichiers n'en ont pas). */
export const imageNameWithoutVs16 = (emoji: string) => imageName(emoji.replace(/️/g, ''))

// ───────────────────────── Récents ─────────────────────────

const RECENTS_KEY = 'form-emoji-recents'

export function loadRecents(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, 24) : []
  } catch {
    return []
  }
}

export function pushRecent(list: string[], emoji: string): string[] {
  return [emoji, ...list.filter((e) => e !== emoji)].slice(0, 24)
}

export function saveRecents(list: string[]) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)) } catch { /* sans importance */ }
}

/** Un emoji au hasard (bouton « aléatoire »). */
export function randomEmoji(all: EmojiItem[], rand = Math.random): string {
  const pool = all.filter((e) => e.group !== undefined && e.group !== 2)
  return pool[Math.floor(rand() * pool.length)]?.unicode ?? '📄'
}

/** Emojis très utiles dans un encadré, proposés en tête du sélecteur (comme dans Notion). */
export const CALLOUT_EMOJIS = ['💡', '👉', '☝️', '👌', '🔑', '🚧', '⚠️', '🔥', '📌', '✂️', '❓', '🚫', '⛔', '⏰', '☎️', '🚨', '♻️', '✅', '🔒', '📎', '📖', '🗣️', '➡️', '📣', '🛠️', '⚙️']

/** Emojis récents (Unicode 16) dont Apple n'a pas encore publié le dessin : mieux vaut ne pas les proposer. */
const NO_APPLE_ARTWORK = new Set(['1FAEA', '1FAEF', '1FAC8', '1FACD', '1F6D8', '1FA8A', '1FA8E', '1F9D1-200D-1FA70'])

/** Charge la liste française complète (en un second temps, pour ne pas alourdir le démarrage). */
export async function loadEmojiData(): Promise<EmojiItem[]> {
  const mod = await import('emojibase-data/fr/compact.json')
  return (mod.default as unknown as EmojiItem[]).filter((e) => e.group !== undefined && e.group !== 2 && !NO_APPLE_ARTWORK.has(e.hexcode))
}
