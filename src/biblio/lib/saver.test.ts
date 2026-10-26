import { describe, expect, it } from 'vitest'
import { buildJobs, cookieNote, EMPTY_SAVER, instagramUrl, type SaverSettings } from './saver.ts'

const full: SaverSettings = { igUser: '@dsrt.add', pinUrl: ' https://www.pinterest.com/DYSARTADD/ ', igCookies: 'C:/ig.txt', pinCookies: 'C:/pin.txt', doIg: true, doPin: true }

describe('instagramUrl', () => {
  it('ouvre les enregistrés du compte, avec ou sans @', () => {
    expect(instagramUrl('@dsrt.add')).toBe('https://www.instagram.com/dsrt.add/saved/')
    expect(instagramUrl(' dsrt.add ')).toBe('https://www.instagram.com/dsrt.add/saved/')
  })
})

describe('buildJobs', () => {
  it('Instagram d\'abord, puis Pinterest, chacun avec ses cookies', () => {
    const { jobs, problem } = buildJobs(full)
    expect(problem).toBeNull()
    expect(jobs).toEqual([
      { url: 'https://www.instagram.com/dsrt.add/saved/', cookies: 'C:/ig.txt' },
      { url: 'https://www.pinterest.com/DYSARTADD/', cookies: 'C:/pin.txt' },
    ])
  })
  it('une seule source cochée', () => {
    expect(buildJobs({ ...full, doPin: false }).jobs).toHaveLength(1)
    expect(buildJobs({ ...full, doIg: false }).jobs[0].url).toContain('pinterest')
  })
  it('dit ce qui manque', () => {
    expect(buildJobs({ ...full, igUser: ' @ ' }).problem).toBe('Indique ton pseudo Instagram.')
    expect(buildJobs({ ...full, igCookies: '' }).problem).toBe("Choisis ton fichier cookies.txt d'Instagram.")
    expect(buildJobs({ ...full, pinUrl: '' }).problem).toBe('Indique le lien de ton profil Pinterest.')
    expect(buildJobs({ ...full, pinCookies: '' }).problem).toBe('Choisis ton fichier cookies.txt de Pinterest.')
    expect(buildJobs({ ...EMPTY_SAVER, doIg: false, doPin: false }).problem).toBe('Coche au moins une source.')
  })
})

describe('cookieNote', () => {
  it('rien à dire si le fichier est récent ou s\'il n\'y en a pas', () => {
    expect(cookieNote('', null)).toBeNull()
    expect(cookieNote('C:/ig.txt', 1)).toBeNull()
  })
  it('prévient d\'un fichier absent ou vieux', () => {
    expect(cookieNote('C:/ig.txt', null)).toContain('introuvable')
    expect(cookieNote('C:/ig.txt', 9)).toContain('9 jours')
  })
})
