import { describe, expect, it } from 'vitest'
import { shouldEmbedAgain } from './embedQueue.ts'

describe('shouldEmbedAgain', () => {
  it('relance quand des images sont arrivées pendant l\'analyse', () => {
    expect(shouldEmbedAgain({ requested: true, pending: 40, failed: 0 })).toBe(true)
  })
  it('ne tourne pas en rond sur des images illisibles', () => {
    expect(shouldEmbedAgain({ requested: true, pending: 2, failed: 2 })).toBe(false)
  })
  it('sans nouvelle demande, ne relance pas', () => {
    expect(shouldEmbedAgain({ requested: false, pending: 40, failed: 0 })).toBe(false)
  })
})
