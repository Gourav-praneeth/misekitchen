import { describe, expect, it } from 'vitest'
import { canonicalFoodName, foodCatalog, getFoodIntelligence } from './foodCatalog'

describe('food intelligence catalog', () => {
  it('contains a broad offline catalog', () => {
    expect(foodCatalog.length).toBeGreaterThanOrEqual(95)
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

  it('auto-suggests the expanded ingredient icons and storage details', () => {
    expect(getFoodIntelligence('lobster tails')?.profile).toMatchObject({ name: 'Lobster', emoji: '🦞', category: 'Protein', location: 'Fridge' })
    expect(getFoodIntelligence('canned kidney beans')?.profile).toMatchObject({ name: 'Beans', emoji: '🫘', category: 'Pantry', location: 'Pantry' })
    expect(getFoodIntelligence('jalapeño')?.profile).toMatchObject({ name: 'Chili peppers', emoji: '🌶️', location: 'Fridge' })
    expect(getFoodIntelligence('fresh mango')?.profile).toMatchObject({ name: 'Mangoes', emoji: '🥭', location: 'Fridge' })
    expect(getFoodIntelligence('apple cider vinegar')?.profile).toMatchObject({ name: 'Vinegar', emoji: '🫗', location: 'Pantry' })
    expect(getFoodIntelligence('green tea')?.profile).toMatchObject({ name: 'Tea', emoji: '🍵', location: 'Pantry' })
  })

  it('normalizes equivalent names for duplicate detection', () => {
    expect(canonicalFoodName('boneless chicken breast')).toBe('chicken breast')
    expect(canonicalFoodName('GRK YGT')).toBe('greek yogurt')
  })

  it('returns no guess when the catalog has no defensible match', () => {
    expect(getFoodIntelligence('harissa paste')).toBeNull()
  })

  it('separates food type, storage area, and profile-specific freshness', () => {
    expect(getFoodIntelligence('chicken')?.profile).toMatchObject({ foodGroup: 'Protein', storageAreaId: 'fridge', freshnessPolicy: 'tracked' })
    expect(getFoodIntelligence('red chili powder')?.profile).toMatchObject({ foodGroup: 'Spices & seasonings', storageAreaId: 'spice-rack', freshnessPolicy: 'none' })
    expect(getFoodIntelligence('oats')?.profile).toMatchObject({ foodGroup: 'Grains & starches', storageAreaId: 'pantry', freshnessPolicy: 'none' })
    expect(getFoodIntelligence('rice')?.profile.freshnessPolicy).toBe('none')
    expect(getFoodIntelligence('bread')?.profile.freshnessPolicy).toBe('tracked')
  })
})
