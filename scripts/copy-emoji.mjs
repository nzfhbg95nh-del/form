// Copie les images des emojis (style Apple, 64 px) dans public/emoji/apple pour que l'application les affiche.
// Lancé automatiquement avant « npm run dev » et « npm run build » ; le dossier copié n'est pas dans Git.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const from = join('node_modules', 'emoji-datasource-apple', 'img', 'apple', '64')
const to = join('public', 'emoji', 'apple')

if (!existsSync(from)) {
  console.warn('Images des emojis introuvables : lance « npm install ».')
  process.exit(0)
}
mkdirSync(to, { recursive: true })
if (existsSync(to) && readdirSync(to).length >= readdirSync(from).length) {
  console.log('Emojis déjà copiés.')
} else {
  cpSync(from, to, { recursive: true })
  console.log(`Emojis copiés dans ${to}.`)
}
