import { describe, expect, it } from 'vitest'
import { canonicalFoodName, foodCatalog, getFoodIntelligence } from './foodCatalog'

describe('food intelligence catalog', () => {
  it('contains a broad offline catalog', () => {
    expect(foodCatalog.length).toBeGreaterThanOrEqual(65)
  })

  it('expands common grocery receipt abbreviations', () => {
    expect(getFoodIntelligence('BNLS SKNLS CHKN BRST')?.profile.name).toBe('Chicken breast')
    expect(getFoodIntelligence('ORG MLK')?.profile.name).toBe('Milk')
    expect(getFoodIntelligence('GRK YGT')?.profile.name).toBe('Greek yogurt')
    expect(getFoodIntelligence('AVDO')?.profile.name).toBe('Avocado')
  })

  it('prefers the most specific food match', () => {
    expect(getFoodIntelligence('oat milk')?.profile.name).toBe('Oat milk')
    expect(getFoodIntelligence('sweet potatoes')?.profile.name).toBe('Sweet potatoes')
    expect(getFoodIntelligence('chicken broth')?.profile.name).toBe('Chicken broth')
  })

  it('normalizes equivalent names for duplicate detection', () => {
    expect(canonicalFoodName('boneless chicken breast')).toBe('chicken breast')
    expect(canonicalFoodName('GRK YGT')).toBe('greek yogurt')
  })

  it('returns no guess when the catalog has no defensible match', () => {
    expect(getFoodIntelligence('harissa paste')).toBeNull()
  })
})
