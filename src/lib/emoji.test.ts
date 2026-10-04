import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import data from 'emojibase-data/fr/compact.json'
import {
  groupEmojis, GROUPS, imageName, imageNameWithoutVs16, pushRecent, randomEmoji, searchEmojis, withSkin, type EmojiItem,
} from './emoji'

const all = (data as unknown as EmojiItem[]).filter((e) => e.group !== undefined && e.group !== 2)
const imageDir = join(import.meta.dirname, '../../node_modules/emoji-datasource-apple/img/apple/64')

describe('liste des emojis (français)', () => {
  it('contient tous les emojis, rangés dans 9 catégories', () => {
    expect(all.length).toBeGreaterThan(1800)
    const groups = groupEmojis(all)
    expect(groups.map((g) => g.label)).toEqual(GROUPS.map((g) => g.label))
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(all.length)
  })

  it('cherche par nom ou mot-clé français, sans accents ni majuscules', () => {
    const coeur = searchEmojis(all, 'coeur').map((e) => e.unicode)
    expect(coeur).toContain('❤️')
    expect(searchEmojis(all, 'CHAT').some((e) => e.unicode === '🐱')).toBe(true)
    expect(searchEmojis(all, 'gateau anniversaire').length).toBeGreaterThan(0)
    expect(searchEmojis(all, 'zzzzqqq')).toEqual([])
    expect(searchEmojis(all, '  ')).toEqual([])
  })

  it("range d'abord les noms qui commencent par le mot cherché", () => {
    const first = searchEmojis(all, 'pomme')[0]
    expect(first.label.toLowerCase()).toContain('pomme')
  })

  it('applique la teinte de peau quand elle existe', () => {
    const main = all.find((e) => e.unicode === '👋')!
    expect(main.skins?.length).toBe(5)
    expect(withSkin(main, 0)).toBe('👋')
    expect(withSkin(main, 3)).toBe('👋🏽')
    const chat = all.find((e) => e.unicode === '🐱')!
    expect(withSkin(chat, 3)).toBe('🐱')
  })

  it('choisit un emoji au hasard dans la liste', () => {
    expect(randomEmoji(all, () => 0)).toBe(all[0].unicode)
    expect(randomEmoji([], () => 0.5)).toBe('📄')
  })
})

describe('images des emojis (style Apple)', () => {
  it('trouve le nom de fichier de chaque emoji', () => {
    expect(imageName('😀')).toBe('1f600')
    expect(imageName('👨‍💻')).toBe('1f468-200d-1f4bb')
    expect(imageName('❤️')).toBe('2764-fe0f')
    expect(imageNameWithoutVs16('❤️')).toBe('2764')
    expect(imageName('🇫🇷')).toBe('1f1eb-1f1f7')
    expect(imageName('©️')).toBe('00a9-fe0f')
    expect(imageName('#️⃣')).toBe('0023-fe0f-20e3')
  })

  it('a une image pour (presque) tous les emojis, avec ou sans le sélecteur FE0F', () => {
    if (!existsSync(imageDir)) return
    const files = new Set(readdirSync(imageDir))
    const missing = all.filter((e) => !files.has(`${imageName(e.unicode)}.png`) && !files.has(`${imageNameWithoutVs16(e.unicode)}.png`))
    expect(missing.length / all.length).toBeLessThan(0.05)
  })
})

describe('emojis récents', () => {
  it('met le dernier choisi en tête, sans doublon, sur 24 maximum', () => {
    expect(pushRecent(['🍎', '🍌'], '🍌')).toEqual(['🍌', '🍎'])
    expect(pushRecent([], '🍎')).toEqual(['🍎'])
    const many = Array.from({ length: 30 }, (_, i) => String(i))
    expect(pushRecent(many, 'x')).toHaveLength(24)
  })
})
