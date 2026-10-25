// Types décrits en mots (Typo, Recette, Astuces) : on compare l'empreinte d'une image à celle de descriptions écrites
// par le modèle de texte. Une image reçoit le type quand elle ressemble nettement plus à ses descriptions qu'à des
// descriptions « de contraste » (une personne, un paysage, un logo…). Logique « pure », testée automatiquement.
//
// Réglages choisis en regardant des planches d'images à chaque niveau de confiance sur les enregistrements de Victor :
//   Typo (0,7)    : ~1 450 images, quasi toutes des affiches, lettrages et polices ;
//   Recette (0,9) : ~85 images, des plats et des vidéos de cuisine ;
//   Astuces, dans « Autres » (0,9) : ~40 images, environ une sur deux seulement (les astuces se lisent plus qu'elles ne se voient).

export interface SemanticType {
  typeId: string
  /** Confiance minimale (0 à 1) pour attribuer le type à n'importe quelle image. */
  threshold: number
  /** Seuil plus bas, valable seulement pour une image qui n'aurait sinon aucun type (elle irait dans « Autres »). */
  relaxed?: number
  /** Descriptions, en anglais : le modèle les comprend mieux. */
  prompts: string[]
}

export const SEMANTIC_TYPES: SemanticType[] = [
  {
    typeId: 'typo',
    threshold: 0.7,
    relaxed: 0.5,
    prompts: [
      'a poster with big typography',
      'a typographic poster design',
      'a font specimen',
      'lettering and custom type design',
      'an image made of large letters and text',
      'expressive typeface design',
    ],
  },
  {
    typeId: 'recette',
    threshold: 0.9,
    relaxed: 0.65,
    prompts: [
      'a photo of a plate of food',
      'a recipe video of cooking food',
      'a delicious home cooked meal',
      'food being prepared in a kitchen',
      'a close up of a dish of food',
      'baking a cake or pastry',
    ],
  },
  {
    // « Autres » : les astuces (3D, graphisme…) en font partie ; le reste du fourre-tout vient des images que l'IA n'arrive pas à ranger.
    typeId: 'autres',
    threshold: 0.9,
    prompts: [
      'a screen recording of someone using Blender',
      'a screenshot of a node editor in 3D software',
      'a tutorial slide with tips and numbered steps',
      'a how to tutorial video thumbnail with title text',
      'software interface with timeline layers and panels',
      'tips and tricks for designers shown on screen',
      'a step by step guide with text instructions',
      'a screenshot of Photoshop or Illustrator with a tutorial',
    ],
  },
]

/** Descriptions de contraste : ce que les types ci-dessus ne sont PAS. Elles évitent de prendre une cuisine ou un rendu 3D pour une recette ou une astuce. */
export const CONTRAST_PROMPTS = [
  'a photo of a person',
  'a landscape photograph',
  'a product photo on a plain background',
  'a photo of a building or interior',
  'a fashion photograph',
  'a logo or brand identity design',
  'a website design screenshot',
  'an abstract 3D render',
  'a painting or drawing',
  'an album cover or poster artwork',
  'a photo of an object',
  'a tattoo design',
  'an interior of a kitchen',
  'ceramic tableware and pottery',
  'a food packaging design',
  'a still life photograph of fruit',
  'a person talking to the camera',
  'a finished 3D character render',
  'a 3D render of an object',
  'a cute 3D character illustration',
  'a sewing pattern diagram',
  'a photo of a sewing project',
]

export const allPrompts = (): string[] => [...SEMANTIC_TYPES.flatMap((t) => t.prompts), ...CONTRAST_PROMPTS]

export interface PromptMatrix {
  dim: number
  /** Les empreintes des descriptions, l'une après l'autre. */
  matrix: Float32Array
  /** Pour chaque description : le type qu'elle décrit, ou '' pour une description de contraste. */
  groups: string[]
}

/** Assemble les empreintes des descriptions (dans l'ordre de `allPrompts`). */
export function buildPromptMatrix(vectors: ReadonlyMap<string, ArrayLike<number>>): PromptMatrix {
  const entries: { typeId: string; vec: ArrayLike<number> }[] = []
  for (const t of SEMANTIC_TYPES) for (const p of t.prompts) entries.push({ typeId: t.typeId, vec: vectors.get(p)! })
  for (const p of CONTRAST_PROMPTS) entries.push({ typeId: '', vec: vectors.get(p)! })
  const dim = entries[0]?.vec.length ?? 0
  const matrix = new Float32Array(entries.length * dim)
  entries.forEach((e, j) => matrix.set(e.vec as Float32Array, j * dim))
  return { dim, matrix, groups: entries.map((e) => e.typeId) }
}

export interface SemanticHit {
  typeId: string
  /** Probabilité (0 à 1) que l'image corresponde à ce type plutôt qu'aux descriptions de contraste. */
  score: number
}

/**
 * Types décrits en mots que cette image mérite. Comme dans CLIP : on compare l'image à toutes les descriptions, on
 * transforme les ressemblances en probabilités (softmax, température 100) et on additionne celles de chaque type.
 */
export function semanticHits(image: ArrayLike<number>, prompts: PromptMatrix, thresholds: Readonly<Record<string, number>>, temperature = 100): SemanticHit[] {
  const { dim, matrix, groups } = prompts
  const m = groups.length
  if (m === 0) return []
  const logits = new Float64Array(m)
  let max = -Infinity
  for (let j = 0; j < m; j++) {
    let s = 0
    const base = j * dim
    for (let i = 0; i < dim; i++) s += image[i] * matrix[base + i]
    logits[j] = s * temperature
    if (logits[j] > max) max = logits[j]
  }
  let total = 0
  for (let j = 0; j < m; j++) {
    logits[j] = Math.exp(logits[j] - max)
    total += logits[j]
  }
  const sums = new Map<string, number>()
  for (let j = 0; j < m; j++) if (groups[j] !== '') sums.set(groups[j], (sums.get(groups[j]) ?? 0) + logits[j] / total)
  return [...sums.entries()]
    .filter(([typeId, score]) => typeId in thresholds && score >= thresholds[typeId])
    .map(([typeId, score]) => ({ typeId, score }))
    .sort((a, b) => b.score - a.score)
}

/** Les seuils par type, dans la forme attendue par `semanticHits` : les seuils stricts, ou (`relaxed`) les seuils bas. */
export const thresholdsOf = (types: SemanticType[] = SEMANTIC_TYPES, relaxed = false): Record<string, number> =>
  Object.fromEntries(types.map((t) => [t.typeId, relaxed ? (t.relaxed ?? t.threshold) : t.threshold]))
