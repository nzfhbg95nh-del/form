import { formatBytes } from '@/biblio/lib/vectors.ts'

/**
 * « Cet ordinateur » : ce qui marche et ce qui manque sur l'ordinateur où Form tourne, dit en français simple.
 * Les chemins retenus (bibliothèque, sauvegardes) peuvent venir d'un autre profil Windows ou d'un disque débranché ; certains
 * programmes (ffmpeg) ou codecs (HEVC) peuvent manquer : chaque point dit quoi faire.
 */
export type CheckLevel = 'ok' | 'warn' | 'info'

export interface Check {
  id: string
  level: CheckLevel
  title: string
  detail: string
}

export interface DiagnosticInput {
  libraryRoot: string
  libraryFound: boolean | null
  cacheInLibrary: boolean | null
  /** Place libre sur le disque de la bibliothèque (octets). */
  freeBytes: number | null
  backupDir: string | null
  backupFound: boolean | null
  canPlayH264: boolean
  canPlayHevc: boolean
  ffmpeg: boolean | null
  aiProvider: string | null
  aiModelReady: boolean | null
  /** Fichiers de la bibliothèque sans miniature. */
  withoutThumb: number | null
}

/** En dessous, on prévient que le disque de la bibliothèque est presque plein. */
export const LOW_DISK_BYTES = 2 * 1024 * 1024 * 1024

export function buildChecks(i: DiagnosticInput): Check[] {
  const out: Check[] = []

  if (i.libraryRoot.trim() === '') {
    out.push({ id: 'library', level: 'warn', title: 'Aucun dossier de bibliothèque', detail: 'Choisis ton dossier dans Réglages > Bibliothèque.' })
  } else if (i.libraryFound === false) {
    out.push({ id: 'library', level: 'warn', title: 'Dossier de la bibliothèque introuvable', detail: `« ${i.libraryRoot} » n'existe pas sur cet ordinateur (disque débranché, dossier déplacé, autre profil Windows ?). Choisis son emplacement dans Réglages > Bibliothèque.` })
  } else if (i.libraryFound === true) {
    out.push({ id: 'library', level: 'ok', title: 'Bibliothèque trouvée', detail: i.libraryRoot })
    if (i.freeBytes !== null) {
      out.push(
        i.freeBytes < LOW_DISK_BYTES
          ? { id: 'disk', level: 'warn', title: 'Disque presque plein', detail: `Il reste ${formatBytes(i.freeBytes)} sur le disque de la bibliothèque : les miniatures et les téléchargements risquent de ne plus tenir. Tu peux déplacer la bibliothèque sur un autre disque.` }
          : { id: 'disk', level: 'ok', title: `Place libre : ${formatBytes(i.freeBytes)}`, detail: 'Sur le disque de la bibliothèque.' },
      )
    }
    if (i.cacheInLibrary === false) {
      out.push({ id: 'cache', level: 'info', title: 'Cache hors de la bibliothèque', detail: 'Les miniatures et le modèle d\'IA sont sur le disque C: : « Déplacer ma bibliothèque… » les range dans la bibliothèque.' })
    }
  }

  if (!i.backupDir) {
    out.push({ id: 'backup', level: 'warn', title: 'Pas de dossier de sauvegarde', detail: 'Choisis-en un dans Réglages > Général : sans lui, tes recettes, devis et factures ne sont pas sauvegardés.' })
  } else if (i.backupFound === false) {
    out.push({ id: 'backup', level: 'warn', title: 'Dossier de sauvegarde introuvable', detail: `« ${i.backupDir} » n'existe pas sur cet ordinateur. À la prochaine sauvegarde, Form utilisera « Documents\\Form sauvegardes » à la place.` })
  } else {
    out.push({ id: 'backup', level: 'ok', title: 'Dossier de sauvegarde trouvé', detail: i.backupDir })
  }

  if (!i.canPlayH264) {
    out.push({ id: 'h264', level: 'warn', title: 'Vidéos Instagram non lues', detail: 'Cet ordinateur ne sait pas lire les vidéos H.264 (celles d\'Instagram) : pas de miniatures de vidéos. Mets Windows à jour.' })
  } else {
    out.push({ id: 'h264', level: 'ok', title: 'Vidéos Instagram lues', detail: 'Les miniatures de vidéos peuvent se faire.' })
  }
  if (i.canPlayH264 && !i.canPlayHevc) {
    out.push({ id: 'hevc', level: 'info', title: 'Vidéos HEVC non lues', detail: 'Quelques vidéos (iPhone, caméras) en HEVC peuvent rester sans miniature. Si tu en as besoin, installe « Extensions vidéo HEVC » depuis le Microsoft Store.' })
  }
  if (i.withoutThumb !== null && i.withoutThumb > 0) {
    out.push({ id: 'thumbs', level: 'warn', title: `${i.withoutThumb} fichier${i.withoutThumb > 1 ? 's' : ''} sans miniature`, detail: 'Réglages > Bibliothèque > Mise à jour > « Faire les miniatures des vidéos ».' })
  }

  if (i.ffmpeg === false) {
    out.push({ id: 'ffmpeg', level: 'info', title: 'ffmpeg absent (facultatif)', detail: 'Form n\'en a pas besoin pour les miniatures. Seule la lecture du texte écrit dans les vidéos en a besoin.' })
  } else if (i.ffmpeg === true) {
    out.push({ id: 'ffmpeg', level: 'ok', title: 'ffmpeg présent', detail: 'La lecture du texte des vidéos est possible.' })
  }

  if (i.aiModelReady === true) {
    out.push({ id: 'ai', level: 'ok', title: 'IA locale prête', detail: i.aiProvider ? `Elle tourne sur : ${i.aiProvider}.` : 'Elle tourne sur cet ordinateur.' })
  } else if (i.aiModelReady === false) {
    out.push({ id: 'ai', level: 'info', title: 'Modèle d\'IA pas encore téléchargé', detail: 'Réglages > Bibliothèque > IA locale > « Télécharger le modèle » (une seule fois).' })
  }

  return out
}

/** Le nombre de points à surveiller. */
export const warnings = (checks: Check[]) => checks.filter((c) => c.level === 'warn').length
