import { describe, expect, it } from 'vitest'
import { compareVersions, isNewer } from './updates'

describe('versions', () => {
  it('compare des numéros de version', () => {
    expect(compareVersions('0.39.0', '0.38.6')).toBeGreaterThan(0)
    expect(compareVersions('0.38.6', '0.39.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('v0.38.6', '0.38.6')).toBe(0)
    expect(compareVersions('0.38', '0.38.0')).toBe(0)
  })

  it('ne propose que les versions strictement plus récentes', () => {
    expect(isNewer('0.39.0', '0.38.6')).toBe(true)
    expect(isNewer('0.38.6', '0.38.6')).toBe(false)
    expect(isNewer('0.38.5', '0.38.6')).toBe(false)
  })
})
