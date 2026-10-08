import { describe, expect, it } from 'vitest'
import { normalizeUnit, parseEmojiList, parseLines, parseRecipe, parseTasks, recipeBlocks, responseSchema, systemPrompt } from './ai'
import { detectSensitive, planSend, redactContacts, summarize } from './sensitive'

describe('informations sensibles avant envoi à Google', () => {
  const text = "Facture pour Mme Durand (marie.durand@exemple.fr, 06 12 34 56 78). Logo 450 €, charte 1 200,50 euros. IBAN FR76 3000 6000 0112 3456 7890 189, SIRET 732 829 320 00074."

  it('repère IBAN, e-mails, téléphones, SIRET et montants, chacun une seule fois', () => {
    const found = detectSensitive(text)
    const kinds = found.map((f) => f.kind)
    expect(kinds.filter((k) => k === 'email')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'phone')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'iban')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'siret')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'amount')).toHaveLength(2)
    expect(found.find((f) => f.kind === 'iban')?.text).toContain('FR76')
  })

  it('ne confond pas un texte ordinaire avec une donnée sensible', () => {
    expect(detectSensitive('Faire une affiche pour le festival, livrer vendredi')).toEqual([])
    expect(detectSensitive('Rendez-vous le 12 octobre à 14 h')).toEqual([])
  })

  it('masque les coordonnées mais garde les montants', () => {
    const out = redactContacts(text)
    expect(out).not.toContain('marie.durand')
    expect(out).not.toContain('06 12')
    expect(out).not.toContain('FR76')
    expect(out).not.toContain('732 829')
    expect(out).toContain('450 €')
    expect(out).toContain('[E-MAIL]')
    expect(out).toContain('[IBAN]')
  })

  it("exige une confirmation tant qu'il reste du sensible dans ce qui part", () => {
    expect(planSend('Idée de flyer pour le salon', true).needsConfirmation).toBe(false)
    const redacted = planSend(text, true)
    expect(redacted.remaining.every((f) => f.kind === 'amount')).toBe(true)
    expect(redacted.needsConfirmation).toBe(true) // les montants partent : il faut confirmer
    const raw = planSend(text, false)
    expect(raw.remaining.length).toBeGreaterThan(redacted.remaining.length)
    expect(planSend('Appeler le client demain', true).text).toBe('Appeler le client demain')
    expect(planSend('Mail : a@b.fr', true).needsConfirmation).toBe(false) // masqué : plus rien de sensible
    expect(planSend('Mail : a@b.fr', false).needsConfirmation).toBe(true)
  })

  it('résume en langage simple', () => {
    expect(summarize(detectSensitive(text))).toBe('1 IBAN, 1 adresse e-mail, 1 numéro de téléphone, 1 SIRET / SIREN, 2 montants')
  })
})

describe('réponses de Gemini vérifiées', () => {
  it('lit une recette', () => {
    const r = parseRecipe(JSON.stringify({ title: ' Tarte aux pommes ', servings: '6 personnes', prep_minutes: 20, cook_minutes: 35.4, ingredients: ['4 pommes', ' ', '200 g de farine'], steps: ['Éplucher', 'Cuire'], notes: null }))
    expect(r).toEqual({ title: 'Tarte aux pommes', servings: '6 personnes', prepMinutes: 20, cookMinutes: 35, ingredients: ['4 pommes', '200 g de farine'], steps: ['Éplucher', 'Cuire'], notes: '' })
    expect(() => parseRecipe('{"title":"x","ingredients":[],"steps":[]}')).toThrow(/Aucune recette/)
    expect(() => parseRecipe('pas du json')).toThrow(/pas pu être lue/)
    expect(parseRecipe('```json\n{"title":"T","ingredients":["a"],"steps":[]}\n```').title).toBe('T')
  })

  it('lit des lignes de facture : prix en centimes, unités normalisées, prix absent = null', () => {
    const lines = parseLines(JSON.stringify({ lines: [
      { label: 'Logo', quantity: 1, unit: 'forfait', unit_price_eur: 450 },
      { label: 'Retouches', description: 'Série 2', quantity: 2.5, unit: 'Heures', unit_price_eur: 33.33 },
      { label: 'Impression', quantity: null, unit: 'cartons', unit_price_eur: null },
      { label: '  ' },
      { label: 'Négatif', unit_price_eur: -5 },
    ] }))
    expect(lines).toEqual([
      { label: 'Logo', description: '', quantity_milli: 1000, unit: 'forfait', unit_price_cents: 45000 },
      { label: 'Retouches', description: 'Série 2', quantity_milli: 2500, unit: 'heure', unit_price_cents: 3333 },
      { label: 'Impression', description: '', quantity_milli: 1000, unit: 'forfait', unit_price_cents: null },
      { label: 'Négatif', description: '', quantity_milli: 1000, unit: 'forfait', unit_price_cents: null },
    ])
    expect(() => parseLines('{"lines":[]}')).toThrow(/Aucune ligne/)
    expect(parseLines('{"lines":[{"label":"x","unit_price_eur":19.99}]}')[0].unit_price_cents).toBe(1999)
  })

  it('normalise les unités', () => {
    expect(normalizeUnit('JOURS')).toBe('jour')
    expect(normalizeUnit('h')).toBe('heure')
    expect(normalizeUnit('pcs')).toBe('pièce')
    expect(normalizeUnit('mois')).toBe('mois')
    expect(normalizeUnit('kilomètres')).toBe('forfait')
    expect(normalizeUnit(undefined)).toBe('forfait')
  })

  it('lit des tâches : dates invalides écartées, priorités contrôlées', () => {
    const tasks = parseTasks(JSON.stringify({ tasks: [
      { title: 'Envoyer le devis', due_date: '2026-10-09', priority: 'Haute' },
      { title: 'Appeler Marie', due_date: '2026-02-31', priority: 'urgent' },
      { title: 'Ranger', due_date: 'demain', priority: null },
      { title: '' },
    ] }))
    expect(tasks).toEqual([
      { title: 'Envoyer le devis', due: '2026-10-09', priority: 'haute' },
      { title: 'Appeler Marie', due: null, priority: null },
      { title: 'Ranger', due: null, priority: null },
    ])
    expect(() => parseTasks('{"tasks":[]}')).toThrow(/Aucune tâche/)
  })

  it("fabrique la page d'une recette", () => {
    const blocks = recipeBlocks({ title: 'T', servings: '4 personnes', prepMinutes: 10, cookMinutes: null, ingredients: ['a', 'b'], steps: ['x'], notes: 'ok' }) as { type: string; content?: string }[]
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'heading', 'checkListItem', 'checkListItem', 'heading', 'numberedListItem', 'heading', 'paragraph'])
    expect(blocks[0].content).toBe('Portions : 4 personnes')
    expect(blocks[1].content).toBe('Préparation : 10 min')
  })

  it('demande à Gemini un format précis et lui donne la date du jour', () => {
    expect(systemPrompt('tasks', '2026-10-04')).toContain('2026-10-04')
    expect(systemPrompt('lines', '2026-10-04')).toContain('Ne calcule aucune TVA')
    for (const mode of ['recipe', 'lines', 'tasks'] as const) {
      expect((responseSchema(mode) as { type: string }).type).toBe('OBJECT')
    }
  })
})

describe('emojis proposés par Gemini', () => {
  it('garde seulement de vrais emojis, un par entrée, sans doublon', () => {
    const raw = JSON.stringify({ emojis: ['🐒', '🐒', 'abc', '🏺', '🐒🏺', ' 🎨 ', 42] })
    expect(parseEmojiList(raw)).toEqual(['🐒', '🏺', '🎨'])
  })
  it('refuse une réponse sans emoji', () => {
    expect(() => parseEmojiList(JSON.stringify({ emojis: ['x'] }))).toThrow()
    expect(() => parseEmojiList('pas du json')).toThrow()
  })
})

import { videoLinkProblem, youtubeId, youtubeWatchUrl } from './ai'

describe('recette depuis une vidéo', () => {
  it('reconnaît les liens YouTube sous toutes leurs formes', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/abcDEF12345')).toBe('abcDEF12345')
    expect(youtubeId('https://www.youtube.com/embed/abcDEF12345')).toBe('abcDEF12345')
    expect(youtubeId('https://youtube.com/')).toBeNull()
    expect(youtubeId('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(youtubeId('https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(youtubeId('pas un lien')).toBeNull()
    expect(youtubeWatchUrl('abc12345')).toBe('https://www.youtube.com/watch?v=abc12345')
  })

  it('explique pourquoi Instagram et les autres ne marchent pas', () => {
    expect(videoLinkProblem('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(videoLinkProblem('https://www.instagram.com/reel/Cx123/')).toContain('Instagram')
    expect(videoLinkProblem('https://www.tiktok.com/@x/video/1')).toContain('légende')
    expect(videoLinkProblem('https://exemple.fr/recette')).toContain('YouTube')
    expect(videoLinkProblem('blabla')).toContain('lien')
  })
})
