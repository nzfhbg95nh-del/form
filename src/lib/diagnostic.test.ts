import { describe, expect, it } from 'vitest'
import { buildChecks, LOW_DISK_BYTES, warnings, type DiagnosticInput } from './diagnostic'

const GO = 1e9

const good = (): DiagnosticInput => ({
  libraryRoot: 'D:\\Bibliotheque',
  libraryFound: true,
  cacheInLibrary: true,
  freeBytes: 100 * GO,
  backupDir: 'C:\\Users\\NOE\\Documents\\Form sauvegardes',
  backupFound: true,
  canPlayH264: true,
  canPlayHevc: true,
  ffmpeg: true,
  aiProvider: 'GPU',
  aiModelReady: true,
  withoutThumb: 0,
})

const byId = (checks: ReturnType<typeof buildChecks>, id: string) => checks.find((c) => c.id === id)

describe('Cet ordinateur : tout va bien', () => {
  it('ne signale rien quand tout est en place', () => {
    const checks = buildChecks(good())
    expect(warnings(checks)).toBe(0)
    expect(checks.every((c) => c.level === 'ok')).toBe(true)
    expect(byId(checks, 'disk')?.title).toBe('Place libre : 100,00 Go')
  })
})

describe('Cet ordinateur : la bibliothèque', () => {
  it('prévient quand aucun dossier n\'est choisi', () => {
    const c = byId(buildChecks({ ...good(), libraryRoot: '', libraryFound: false }), 'library')!
    expect(c.level).toBe('warn')
    expect(c.detail).toContain('Réglages > Bibliothèque')
  })

  it('prévient quand le dossier retenu n\'existe pas ici (autre profil, disque débranché)', () => {
    const checks = buildChecks({ ...good(), libraryRoot: 'C:\\Users\\ancien-profil\\Desktop\\Bibliotheque', libraryFound: false })
    const c = byId(checks, 'library')!
    expect(c.level).toBe('warn')
    expect(c.detail).toContain('ancien-profil')
    expect(byId(checks, 'disk')).toBeUndefined()
  })

  it('prévient quand le disque est presque plein, pas avant', () => {
    expect(byId(buildChecks({ ...good(), freeBytes: LOW_DISK_BYTES - 1 }), 'disk')?.level).toBe('warn')
    expect(byId(buildChecks({ ...good(), freeBytes: LOW_DISK_BYTES }), 'disk')?.level).toBe('ok')
  })

  it('signale un cache resté hors de la bibliothèque, sans en faire une alerte', () => {
    expect(byId(buildChecks({ ...good(), cacheInLibrary: false }), 'cache')?.level).toBe('info')
  })
})

describe('Cet ordinateur : les sauvegardes', () => {
  it('prévient sans dossier, ou avec un dossier introuvable', () => {
    expect(byId(buildChecks({ ...good(), backupDir: null, backupFound: null }), 'backup')?.level).toBe('warn')
    const lost = byId(buildChecks({ ...good(), backupDir: 'C:\\Users\\noesa\\Documents\\Form sauvegardes', backupFound: false }), 'backup')!
    expect(lost.level).toBe('warn')
    expect(lost.detail).toContain('Documents\\Form sauvegardes')
  })
})

describe('Cet ordinateur : les vidéos et les programmes', () => {
  it('prévient quand les vidéos Instagram ne sont pas lues', () => {
    expect(byId(buildChecks({ ...good(), canPlayH264: false, canPlayHevc: false }), 'h264')?.level).toBe('warn')
  })

  it('HEVC absent : simple information, avec quoi installer', () => {
    const c = byId(buildChecks({ ...good(), canPlayHevc: false }), 'hevc')!
    expect(c.level).toBe('info')
    expect(c.detail).toContain('Microsoft Store')
  })

  it('compte les fichiers sans miniature, au singulier et au pluriel', () => {
    expect(byId(buildChecks({ ...good(), withoutThumb: 1 }), 'thumbs')?.title).toBe('1 fichier sans miniature')
    expect(byId(buildChecks({ ...good(), withoutThumb: 25 }), 'thumbs')?.title).toBe('25 fichiers sans miniature')
    expect(byId(buildChecks({ ...good(), withoutThumb: null }), 'thumbs')).toBeUndefined()
  })

  it('ffmpeg absent n\'est pas une alerte (Form s\'en passe pour les miniatures)', () => {
    const c = byId(buildChecks({ ...good(), ffmpeg: false }), 'ffmpeg')!
    expect(c.level).toBe('info')
    expect(c.detail).toContain('miniatures')
  })

  it('dit où tourne l\'IA, ou qu\'il faut télécharger le modèle', () => {
    expect(byId(buildChecks(good()), 'ai')?.detail).toBe('Elle tourne sur : GPU.')
    expect(byId(buildChecks({ ...good(), aiModelReady: false }), 'ai')?.level).toBe('info')
    expect(byId(buildChecks({ ...good(), aiModelReady: null }), 'ai')).toBeUndefined()
  })
})
