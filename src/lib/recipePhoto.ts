/** Réduit une image (data URL) à `maxWidth` pixels de large et la compresse en JPEG, pour ne pas alourdir la base. */
export async function resizeToJpeg(dataUrl: string, maxWidth = 960, quality = 0.85): Promise<string> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const scale = Math.min(1, maxWidth / img.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Description envoyée à l'IA pour dessiner le plat : le nom et quelques ingrédients, jamais rien de personnel. */
export function recipePhotoPrompt(title: string, ingredients: string[]): string {
  const name = title.trim() || 'un plat maison'
  const items = ingredients
    .map((i) => i.replace(/^[\d\s.,/½¼¾⅓⅔⅛à-]+/i, '').replace(/^(g|kg|ml|cl|l|cuill[eè]res?( à (soupe|caf[eé]))?|c\. ?à ?[sc]\.?|tasses?|verres?|pinc[eé]es?|sachets?)\s+(de |d['’])?/i, '').trim())
    .filter(Boolean)
    .slice(0, 6)
  return `Photo culinaire appétissante de « ${name} », ${items.length ? `avec ${items.join(', ')}, ` : ''}vue en légère plongée, lumière naturelle douce, assiette ou plat de présentation simple, fond neutre, très réaliste, sans aucun texte ni logo.`
}
