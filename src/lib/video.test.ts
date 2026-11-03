import { describe, expect, it } from 'vitest'
import { fileNameOf, isLocalPath, isVideoFileName, videoSource, videoTitle } from './video'

describe('vidéos', () => {
  it('reconnaît les formats lisibles, sans tenir compte des majuscules', () => {
    expect(isVideoFileName('film.MP4')).toBe(true)
    expect(isVideoFileName('a.webm')).toBe(true)
    expect(isVideoFileName('a.mov')).toBe(true)
    expect(isVideoFileName('image.png')).toBe(false)
    expect(isVideoFileName('sans-extension')).toBe(false)
  })
  it('reconnaît un chemin de l’ordinateur', () => {
    expect(isLocalPath('C:\\Videos\\a.mp4')).toBe(true)
    expect(isLocalPath('d:/x/a.mp4')).toBe(true)
    expect(isLocalPath('\\\\serveur\\partage\\a.mp4')).toBe(true)
    expect(isLocalPath('https://youtu.be/abc123XYZ')).toBe(false)
  })
  it('donne le nom du fichier', () => {
    expect(fileNameOf('C:\\Users\\Moi\\Vidéos\\rendu final.mp4')).toBe('rendu final.mp4')
    expect(fileNameOf('D:/a/b.webm')).toBe('b.webm')
  })
  it('un fichier vidéo garde son chemin', () => {
    expect(videoSource('C:\\Videos\\rendu.mp4')).toEqual({ kind: 'file', path: 'C:\\Videos\\rendu.mp4', name: 'rendu.mp4' })
  })
  it('refuse un fichier qui n’est pas une vidéo', () => {
    expect(videoSource('C:\\Videos\\notes.txt')).toBeNull()
  })
  it('un lien YouTube, Vimeo ou Loom s’intègre', () => {
    expect(videoSource('https://www.youtube.com/watch?v=YpoNPAX8yGA')).toMatchObject({ kind: 'embed', info: { provider: 'youtube' } })
    expect(videoSource('https://vimeo.com/123456')).toMatchObject({ kind: 'embed', info: { provider: 'vimeo' } })
    expect(videoSource('https://www.loom.com/share/0123456789abcdef0123456789abcdef')).toMatchObject({ kind: 'embed', info: { provider: 'loom' } })
  })
  it('refuse les liens qui ne sont pas des vidéos (musique, plan, site quelconque)', () => {
    expect(videoSource('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')).toBeNull()
    expect(videoSource('https://www.google.com/maps?q=Paris')).toBeNull()
    expect(videoSource('https://exemple.com/film.mp4')).toBeNull()
    expect(videoSource('')).toBeNull()
  })
  it('le titre : nom du fichier sans extension, ou nom du site', () => {
    expect(videoTitle('C:\\Videos\\rendu final.mp4')).toBe('rendu final')
    expect(videoTitle('https://youtu.be/YpoNPAX8yGA')).toBe('YouTube')
  })
})
