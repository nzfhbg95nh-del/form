import { isTauri } from './repo'
import { UNITS } from './business'

export type AiMode = 'recipe' | 'lines' | 'tasks'

export const MODE_LABELS: Record<AiMode, string> = {
  recipe: 'Texte → recette',
  lines: 'Texte → lignes de facture',
  tasks: 'Texte → liste de tâches',
}

export const DEFAULT_MODEL = 'gemini-2.5-flash'

// ───────────────────────── Ce qu'on demande à Gemini ─────────────────────────

const base = (today: string) =>
  `Tu es un assistant intégré à une application de gestion pour un graphiste freelance. Tu transformes un texte fourni par l'utilisateur en données structurées. N'invente rien : si une information n'est pas dans le texte, laisse le champ vide ou null. Réponds uniquement avec le JSON demandé, en français. Aujourd'hui, nous sommes le ${today}.`

export function systemPrompt(mode: AiMode, today: string): string {
  const task: Record<AiMode, string> = {
    recipe:
      "Extrais la recette : titre, nombre de portions (texte, par exemple « 4 personnes »), durées de préparation et de cuisson en minutes (nombres, ou null), liste des ingrédients (une chaîne par ingrédient, avec les quantités), étapes (une phrase par étape, sans numéro), notes éventuelles.",
    lines:
      "Extrais les lignes d'un devis ou d'une facture de prestations : libellé court, description détaillée (facultative), quantité (nombre, 1 par défaut), unité parmi jour, heure, forfait, pièce, mois, et prix unitaire hors taxe en euros (nombre), ou null s'il n'est pas indiqué. Ne calcule aucune TVA.",
    tasks:
      "Extrais les tâches à faire : titre court à l'impératif, date d'échéance au format AAAA-MM-JJ si une date ou un délai est mentionné (calcule-la à partir de la date du jour), sinon null, et priorité (haute, moyenne ou basse) si elle ressort du texte, sinon null.",
  }
  return `${base(today)} ${task[mode]}`
}

// Schémas de réponse (format de l'API Gemini : types en majuscules).
const S = { type: 'STRING' }
const N = { type: 'NUMBER', nullable: true }
const SN = { type: 'STRING', nullable: true }

export function responseSchema(mode: AiMode): unknown {
  if (mode === 'recipe') {
    return {
      type: 'OBJECT',
      properties: {
        title: S, servings: SN, prep_minutes: N, cook_minutes: N,
        ingredients: { type: 'ARRAY', items: S }, steps: { type: 'ARRAY', items: S }, notes: SN,
      },
      required: ['title', 'ingredients', 'steps'],
    }
  }
  if (mode === 'lines') {
    return {
      type: 'OBJECT',
      properties: {
        lines: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { label: S, description: SN, quantity: N, unit: SN, unit_price_eur: N },
            required: ['label'],
          },
        },
      },
      required: ['lines'],
    }
  }
  return {
    type: 'OBJECT',
    properties: {
      tasks: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: S, due_date: SN, priority: SN }, required: ['title'] } },
    },
    required: ['tasks'],
  }
}

// ───────────────────────── Ce que Gemini renvoie, vérifié ─────────────────────────

export interface Recipe {
  title: string
  servings: string
  prepMinutes: number | null
  cookMinutes: number | null
  ingredients: string[]
  steps: string[]
  notes: string
}

export interface AiLine {
  label: string
  description: string
  quantity_milli: number
  unit: string
  /** null : le prix n'était pas dans le texte (à compléter). */
  unit_price_cents: number | null
}

export type AiPriority = 'haute' | 'moyenne' | 'basse'

export interface AiTask {
  title: string
  due: string | null
  priority: AiPriority | null
}

function parseJson(raw: string): Record<string, unknown> {
  try {
    const data = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>
  } catch {
    /* tombe dans l'erreur ci-dessous */
  }
  throw new Error("La réponse de Gemini n'a pas pu être lue. Réessaie, ou reformule ton texte.")
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])
const minutes = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null)

export function parseRecipe(raw: string): Recipe {
  const d = parseJson(raw)
  const recipe: Recipe = {
    title: str(d.title) || 'Recette',
    servings: str(d.servings),
    prepMinutes: minutes(d.prep_minutes),
    cookMinutes: minutes(d.cook_minutes),
    ingredients: strList(d.ingredients),
    steps: strList(d.steps),
    notes: str(d.notes),
  }
  if (recipe.ingredients.length === 0 && recipe.steps.length === 0) throw new Error("Aucune recette trouvée dans ce texte.")
  return recipe
}

const UNIT_ALIASES: Record<string, string> = {
  j: 'jour', jour: 'jour', jours: 'jour', journée: 'jour', journee: 'jour', journées: 'jour',
  h: 'heure', heure: 'heure', heures: 'heure',
  forfait: 'forfait', forfaits: 'forfait', 'forfait global': 'forfait',
  pièce: 'pièce', piece: 'pièce', pièces: 'pièce', pieces: 'pièce', pcs: 'pièce', unité: 'pièce', unite: 'pièce', unités: 'pièce',
  mois: 'mois',
}

export function normalizeUnit(unit: unknown): string {
  const key = str(unit).toLowerCase()
  const mapped = UNIT_ALIASES[key]
  if (mapped) return mapped
  return UNITS.includes(key) ? key : 'forfait'
}

export function parseLines(raw: string): AiLine[] {
  const d = parseJson(raw)
  const list = Array.isArray(d.lines) ? d.lines : []
  const lines: AiLine[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const it = item as Record<string, unknown>
    const label = str(it.label)
    if (!label) continue
    const q = typeof it.quantity === 'number' && it.quantity > 0 ? Math.round(it.quantity * 1000) : 1000
    const price = typeof it.unit_price_eur === 'number' && it.unit_price_eur >= 0 ? Math.round(it.unit_price_eur * 100) : null
    lines.push({ label, description: str(it.description), quantity_milli: Math.min(q, 1_000_000), unit: normalizeUnit(it.unit), unit_price_cents: price })
  }
  if (lines.length === 0) throw new Error('Aucune ligne de prestation trouvée dans ce texte.')
  return lines
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function validDate(v: unknown): string | null {
  const s = str(v)
  if (!ISO_DATE.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s
}

export function parseTasks(raw: string): AiTask[] {
  const d = parseJson(raw)
  const list = Array.isArray(d.tasks) ? d.tasks : []
  const tasks: AiTask[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const it = item as Record<string, unknown>
    const title = str(it.title)
    if (!title) continue
    const p = str(it.priority).toLowerCase()
    tasks.push({ title, due: validDate(it.due_date), priority: p === 'haute' || p === 'moyenne' || p === 'basse' ? p : null })
  }
  if (tasks.length === 0) throw new Error('Aucune tâche trouvée dans ce texte.')
  return tasks
}

// ───────────────────────── Page de recette ─────────────────────────

const h = (text: string) => ({ type: 'heading', props: { level: 2 }, content: text })
const p = (text: string) => ({ type: 'paragraph', content: text })

/** Blocs de l'éditeur pour une recette (même mise en page que le modèle « Recette »). */
export function recipeBlocks(r: Recipe): unknown[] {
  const times = [r.prepMinutes ? `Préparation : ${r.prepMinutes} min` : '', r.cookMinutes ? `Cuisson : ${r.cookMinutes} min` : ''].filter(Boolean).join('   ·   ')
  return [
    ...(r.servings ? [p(`Portions : ${r.servings}`)] : []),
    ...(times ? [p(times)] : []),
    h('Ingrédients'),
    ...r.ingredients.map((i) => ({ type: 'checkListItem', content: i })),
    h('Étapes'),
    ...r.steps.map((s) => ({ type: 'numberedListItem', content: s })),
    ...(r.notes ? [h('Notes'), p(r.notes)] : []),
  ]
}

// ───────────────────────── Appel à Gemini (via le code Windows) ─────────────────────────

declare global {
  interface Window {
    /** Pour les essais dans le navigateur uniquement : simule la réponse de Gemini. */
    __FORM_AI_MOCK?: (mode: AiMode, text: string) => Promise<string>
  }
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import('@tauri-apps/api/core')
  try {
    return await call<T>(command, args)
  } catch (e) {
    throw new Error(typeof e === 'string' ? e : e instanceof Error ? e.message : String(e))
  }
}

export const aiAvailable = () => isTauri() || !!window.__FORM_AI_MOCK

export async function keyExists(): Promise<boolean> {
  return isTauri() ? invoke<boolean>('secret_exists', { name: 'gemini_api_key' }) : !!window.__FORM_AI_MOCK
}

export const saveKey = (key: string) => invoke<void>('secret_set', { name: 'gemini_api_key', value: key })
export const deleteKey = () => invoke<void>('secret_delete', { name: 'gemini_api_key' })
export const listModels = () => invoke<string[]>('gemini_models')

/** Envoie le texte à Gemini et renvoie la réponse brute (JSON). Appelé uniquement après un clic de l'utilisateur. */
export async function askGemini(mode: AiMode, text: string, model: string, today: string): Promise<string> {
  if (!isTauri()) {
    if (window.__FORM_AI_MOCK) return window.__FORM_AI_MOCK(mode, text)
    throw new Error("L'assistant IA n'est disponible que dans l'application Windows.")
  }
  return invoke<string>('gemini_generate', { model, system: systemPrompt(mode, today), prompt: text, schema: responseSchema(mode) })
}

// ───────────────────────── Icônes de page (emoji suggérés, image dessinée) ─────────────────────────

export const IMAGE_MODEL = 'gemini-2.5-flash-image'

declare global {
  interface Window {
    /** Essais dans le navigateur uniquement : simule les réponses de Gemini pour les icônes. */
    __FORM_ICON_MOCK?: (kind: 'emoji' | 'image', text: string) => Promise<string>
  }
}

export const iconAiAvailable = () => isTauri() || !!window.__FORM_ICON_MOCK

/** Garde seulement de vrais emojis (un seul symbole chacun), sans doublon. */
export function parseEmojiList(raw: string): string[] {
  const d = parseJson(raw)
  const list = Array.isArray(d.emojis) ? d.emojis : []
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('fr', { granularity: 'grapheme' }) : null
  const out: string[] = []
  for (const item of list) {
    const e = str(item)
    if (!e || !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(e)) continue
    if (seg && Array.from(seg.segment(e)).length !== 1) continue
    if (!out.includes(e)) out.push(e)
  }
  if (out.length === 0) throw new Error("Gemini n'a proposé aucun emoji. Reformule ta description.")
  return out.slice(0, 12)
}

/** Demande à Gemini quelques emojis qui illustrent une description (après un clic de l'utilisateur). */
export async function suggestEmojis(text: string, model: string): Promise<string[]> {
  if (!isTauri()) {
    if (window.__FORM_ICON_MOCK) return parseEmojiList(await window.__FORM_ICON_MOCK('emoji', text))
    throw new Error("L'assistant IA n'est disponible que dans l'application Windows.")
  }
  const system = "Tu proposes des emojis Unicode standard qui illustrent bien la description donnée. Réponds uniquement avec le JSON demandé : jusqu'à 12 emojis, un seul symbole par entrée, du plus pertinent au moins pertinent."
  const schema = { type: 'OBJECT', properties: { emojis: { type: 'ARRAY', items: S } }, required: ['emojis'] }
  return parseEmojiList(await invoke<string>('gemini_generate', { model, system, prompt: text, schema }))
}

/** Fait dessiner une icône à Gemini : renvoie une image (data URL). */
export async function generateIconImage(text: string, model: string = IMAGE_MODEL): Promise<string> {
  if (!isTauri()) {
    if (window.__FORM_ICON_MOCK) return window.__FORM_ICON_MOCK('image', text)
    throw new Error("L'assistant IA n'est disponible que dans l'application Windows.")
  }
  const prompt = `Une icône carrée, simple et lisible en petit, fond uni ou transparent, style illustration plate et douce, sans aucun texte : ${text}`
  return invoke<string>('gemini_image', { model, prompt })
}
