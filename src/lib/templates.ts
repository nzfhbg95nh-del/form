export interface PageTemplate {
  id: string
  label: string
  icon: string
  title: () => string
  /** Blocs de l'éditeur (format BlockNote simplifié). */
  content: unknown[]
}

const h = (text: string, level = 2) => ({ type: 'heading', props: { level }, content: text })
const p = (text = '') => ({ type: 'paragraph', content: text })
const todo = (text = '') => ({ type: 'checkListItem', content: text })
const step = (text = '') => ({ type: 'numberedListItem', content: text })
const bullet = (text = '') => ({ type: 'bulletListItem', content: text })

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: 'note',
    label: 'Note rapide',
    icon: '📝',
    title: () => `Note du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    content: [p()],
  },
  {
    id: 'recette',
    label: 'Recette',
    icon: '🍳',
    title: () => 'Nouvelle recette',
    content: [
      p('Portions : 4 personnes'),
      p('Préparation : … min   ·   Cuisson : … min'),
      h('Photo'),
      { type: 'image' },
      h('Ingrédients'),
      todo(), todo(), todo(),
      h('Étapes'),
      step(), step(), step(),
      h('Notes'),
      p(),
    ],
  },
  {
    id: 'projet',
    label: 'Projet',
    icon: '🎯',
    title: () => 'Nouveau projet',
    content: [
      p('Client : '),
      p('Échéance : '),
      h('Objectif'),
      p(),
      h('Livrables'),
      todo(), todo(), todo(),
      h('Étapes'),
      step(), step(), step(),
      h('Liens et références'),
      bullet(),
      h('Notes'),
      p(),
    ],
  },
]
