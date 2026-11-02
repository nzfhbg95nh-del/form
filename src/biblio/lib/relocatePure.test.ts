import { describe, expect, it } from 'vitest'
import { describePreview, describeProgress, describeResult, destinationFor, moveSucceeded, progressPercent, type MoveProgress, type MoveResult } from './relocatePure.ts'

const result = (over: Partial<MoveResult> = {}): MoveResult => ({ copied: 0, skipped: 0, failed: 0, bytes: 0, errors: [], cancelled: false, ...over })
const progress = (over: Partial<MoveProgress> = {}): MoveProgress => ({ done_files: 0, total_files: 0, done_bytes: 0, total_bytes: 0, current: '', ...over })

describe('destination du déplacement', () => {
  it('ajoute « Bibliothèque Form » au dossier choisi', () => {
    expect(destinationFor('D:\\Mes images')).toBe('D:\\Mes images\\Bibliothèque Form')
    expect(destinationFor('D:\\Mes images\\')).toBe('D:\\Mes images\\Bibliothèque Form')
    expect(destinationFor('D:\\')).toBe('D:\\Bibliothèque Form')
    expect(destinationFor('D:/Mes images')).toBe('D:/Mes images\\Bibliothèque Form')
  })

  it('garde le dossier tel quel s\'il porte déjà ce nom (majuscules ignorées)', () => {
    expect(destinationFor('F:\\Bibliothèque Form')).toBe('F:\\Bibliothèque Form')
    expect(destinationFor('F:\\bibliothèque form\\')).toBe('F:\\bibliothèque form')
  })
})

describe('textes du déplacement', () => {
  it('résume ce qui sera copié, avec la place libre', () => {
    expect(describePreview({ files: 17073, bytes: 11_320_000_000, free: 682_400_000_000, ok: true, error: null })).toBe(
      '17\u202f073 fichiers · 11,32 Go · 682,40 Go libres sur le disque de destination',
    )
    expect(describePreview({ files: 1, bytes: 5_000_000, free: null, ok: true, error: null })).toBe('1 fichier · 5,0 Mo')
  })

  it('calcule l\'avancement d\'après les octets, ou les fichiers à défaut', () => {
    expect(progressPercent(progress({ done_bytes: 50, total_bytes: 200 }))).toBe(25)
    expect(progressPercent(progress({ done_files: 1, total_files: 4 }))).toBe(25)
    expect(progressPercent(progress())).toBe(0)
    expect(progressPercent(progress({ done_bytes: 999, total_bytes: 100 }))).toBe(100)
  })

  it('écrit l\'avancement', () => {
    expect(describeProgress(progress({ done_files: 120, total_files: 17073, done_bytes: 1_500_000_000, total_bytes: 11_320_000_000 }))).toBe(
      '120 / 17\u202f073 fichiers · 1,50 Go / 11,32 Go',
    )
  })

  it('distingue réussite, arrêt et erreurs', () => {
    expect(moveSucceeded(result({ copied: 3 }))).toBe(true)
    expect(moveSucceeded(result({ failed: 1 }))).toBe(false)
    expect(moveSucceeded(result({ cancelled: true }))).toBe(false)
    expect(describeResult(result({ copied: 3, bytes: 3_000_000 }))).toBe('3 fichiers copiés (3,0 Mo). L\'ancien dossier est intact.')
    expect(describeResult(result({ copied: 3, skipped: 2, bytes: 3_000_000 }))).toContain('2 déjà présents')
    expect(describeResult(result({ failed: 2 }))).toContain('2 fichiers n\'ont pas pu être copiés')
    expect(describeResult(result({ failed: 2 }))).toContain('n\'a pas changé d\'emplacement')
    expect(describeResult(result({ cancelled: true, copied: 10 }))).toContain('Déplacement arrêté')
  })
})
