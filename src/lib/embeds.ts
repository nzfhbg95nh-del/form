// Intégrer un lien dans une page (YouTube, Vimeo, Spotify, Google Maps, Figma, Loom) : on reconnaît le site à son adresse et on
// donne l'adresse « intégrable » (la fenêtre qui s'affiche dans la page). Logique pure, testée automatiquement.

export interface EmbedInfo {
  provider: string
  label: string
  /** L'adresse de la fenêtre à afficher dans la page. */
  src: string
  /** Hauteur conseillée (en pixels) pour une largeur de page ordinaire. */
  height: number
}

export const isUrl = (text: string) => /^https?:\/\/[^\s]+$/i.test(text.trim())

const youtubeId = (u: URL): string | null => {
  const host = u.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') return u.searchParams.get('v')
    const m = /^\/(?:shorts|embed|live)\/([\w-]{6,})/.exec(u.pathname)
    return m ? m[1] : null
  }
  return null
}

/** Le site d'une adresse, si on sait l'intégrer ; sinon rien (on propose alors l'aperçu de lien). */
export function embedFor(raw: string): EmbedInfo | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.replace(/^www\./, '')

  const yt = youtubeId(u)
  if (yt && /^[\w-]{6,}$/.test(yt)) return { provider: 'youtube', label: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${yt}`, height: 405 }

  if (host === 'vimeo.com') {
    const m = /^\/(\d+)/.exec(u.pathname)
    if (m) return { provider: 'vimeo', label: 'Vimeo', src: `https://player.vimeo.com/video/${m[1]}`, height: 405 }
  }

  if (host === 'open.spotify.com') {
    const m = /^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/.exec(u.pathname)
    if (m) return { provider: 'spotify', label: 'Spotify', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: m[1] === 'track' || m[1] === 'episode' ? 152 : 352 }
  }

  if (host === 'loom.com') {
    const m = /^\/(?:share|embed)\/([a-f0-9]{20,})/.exec(u.pathname)
    if (m) return { provider: 'loom', label: 'Loom', src: `https://www.loom.com/embed/${m[1]}`, height: 405 }
  }

  if (host === 'figma.com' && /^\/(file|design|proto|board|slides)\//.test(u.pathname)) {
    return { provider: 'figma', label: 'Figma', src: `https://www.figma.com/embed?embed_host=form&url=${encodeURIComponent(u.toString())}`, height: 450 }
  }

  if ((host === 'google.com' || host === 'maps.google.com' || host === 'google.fr' || host === 'maps.google.fr') && (u.pathname.startsWith('/maps') || host.startsWith('maps.'))) {
    const place = /^\/maps\/place\/([^/]+)/.exec(u.pathname)
    const query = u.searchParams.get('q') ?? (place ? decodeURIComponent(place[1].replace(/\+/g, ' ')) : null)
    if (query) return { provider: 'maps', label: 'Google Maps', src: `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`, height: 400 }
  }
  return null
}

/** Les sites autorisés à s'afficher dans une page (la liste de la politique de sécurité de l'appli). */
export const EMBED_HOSTS = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://open.spotify.com', 'https://www.loom.com', 'https://www.figma.com', 'https://www.google.com']
