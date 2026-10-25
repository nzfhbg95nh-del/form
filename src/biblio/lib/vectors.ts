// Petits outils sur les empreintes d'images (vecteurs de 512 nombres). Logique « pure », testée automatiquement.

/** Lit un vecteur enregistré en base64 (flottants 32 bits, petit-boutiste). */
export function decodeVector(b64: string): Float32Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4))
}

/** Produit scalaire. Les empreintes sont de longueur 1 : c'est directement la ressemblance (de -1 à 1, 1 = identiques). */
export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

/** Ressemblance quelle que soit la longueur des vecteurs. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const na = Math.sqrt(dot(a, a))
  const nb = Math.sqrt(dot(b, b))
  return na === 0 || nb === 0 ? 0 : dot(a, b) / (na * nb)
}

/** 351685709 → « 351,7 Mo » (décimal, comme l'Explorateur de fichiers de macOS ; Windows affiche « 335 Mo » pour le même fichier). */
export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace('.', ',')} Go`
  return `${(n / 1e6).toFixed(1).replace('.', ',')} Mo`
}

/** 75 → « 1 min 15 s ». */
export function formatSeconds(s: number): string {
  const total = Math.max(0, Math.round(s))
  if (total < 60) return `${total} s`
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, '0')} s`
}
