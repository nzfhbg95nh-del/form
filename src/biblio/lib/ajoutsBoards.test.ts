import { describe, expect, it } from 'vitest'
import { isFolderCollectionId, matchBoard } from './ajoutsBoards.ts'

const boards = [
  { id: 'pin:me/Art graphic', name: 'Art graphic' },
  { id: 'pin:me/Architecture & Interior design', name: 'Architecture & Interior design' },
  { id: 'pin:me/3D & CGI', name: '3D & CGI' },
  { id: 'pin:me/Photography & Clip', name: 'Photography & Clip' },
  { id: 'pin:me/Projects (AERO)', name: 'Projects (AERO)' },
  { id: 'pin:me/Projects (DSRT)', name: 'Projects (DSRT)' },
]

describe('matchBoard', () => {
  it('« Art graphique » retrouve le tableau « Art graphic »', () => {
    expect(matchBoard('Art graphique', boards)).toBe('pin:me/Art graphic')
  })
  it('un nom court retrouve le tableau qui commence pareil', () => {
    expect(matchBoard('Architecture', boards)).toBe('pin:me/Architecture & Interior design')
    expect(matchBoard('3d', boards)).toBe('pin:me/3D & CGI') // un mot entier au début du nom
    expect(matchBoard('3d cgi', boards)).toBe('pin:me/3D & CGI')
    expect(matchBoard('Photo', boards)).toBe('pin:me/Photography & Clip')
  })
  it('ignore les accents, les majuscules et la ponctuation', () => {
    expect(matchBoard('ART  GRAPHIC', boards)).toBe('pin:me/Art graphic')
    expect(matchBoard('Ceramique', boards)).toBeNull()
  })
  it('hésite entre plusieurs tableaux : aucun', () => {
    expect(matchBoard('Projects', boards)).toBeNull()
  })
  it('reconnaît les dossiers de premier niveau seulement', () => {
    expect(isFolderCollectionId('man:ajouts/Art graphique')).toBe(true)
    expect(isFolderCollectionId('man:ajouts/Art graphique/Music Artworks')).toBe(false)
    expect(isFolderCollectionId('man:ajouts')).toBe(false)
    expect(isFolderCollectionId('man:abc')).toBe(false)
  })
})
