import { describe, expect, it } from 'vitest'
import { embedFor, isUrl } from './embeds'

describe('intégrations de liens', () => {
  it('reconnaît une adresse seule', () => {
    expect(isUrl('https://exemple.com/page?x=1')).toBe(true)
    expect(isUrl('  https://exemple.com  ')).toBe(true)
    expect(isUrl('bonjour https://exemple.com')).toBe(false)
    expect(isUrl('exemple.com')).toBe(false)
  })
  it('YouTube : watch, youtu.be, shorts', () => {
    expect(embedFor('https://www.youtube.com/watch?v=YpoNPAX8yGA')?.src).toBe('https://www.youtube-nocookie.com/embed/YpoNPAX8yGA')
    expect(embedFor('https://youtu.be/YpoNPAX8yGA?t=10')?.src).toBe('https://www.youtube-nocookie.com/embed/YpoNPAX8yGA')
    expect(embedFor('https://youtube.com/shorts/abc123XYZ_-')?.provider).toBe('youtube')
    expect(embedFor('https://www.youtube.com/@chaine')).toBeNull()
  })
  it('Vimeo, Spotify, Loom, Figma', () => {
    expect(embedFor('https://vimeo.com/123456')?.src).toBe('https://player.vimeo.com/video/123456')
    expect(embedFor('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x')).toMatchObject({ src: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC', height: 152 })
    expect(embedFor('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')?.height).toBe(352)
    expect(embedFor('https://www.loom.com/share/0123456789abcdef0123456789abcdef')?.src).toBe('https://www.loom.com/embed/0123456789abcdef0123456789abcdef')
    expect(embedFor('https://www.figma.com/design/AbCdEf/Mon-projet')?.src).toContain('https://www.figma.com/embed?embed_host=form&url=')
  })
  it('Google Maps : une recherche ou un lieu', () => {
    expect(embedFor('https://www.google.com/maps?q=Tour+Eiffel')?.src).toBe('https://www.google.com/maps?q=Tour%20Eiffel&output=embed')
    expect(embedFor('https://www.google.com/maps/place/Lyon,+France/@45.76,4.83,12z')?.provider).toBe('maps')
  })
  it('refuse ce qu’on ne sait pas intégrer', () => {
    expect(embedFor('https://exemple.com/article')).toBeNull()
    expect(embedFor('javascript:alert(1)')).toBeNull()
    expect(embedFor('pas une adresse')).toBeNull()
  })
})
