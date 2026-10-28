import { describe, expect, it } from 'vitest'
import { expirationDateFromText, expirationWarning, freshnessCueFromText, removeFreshnessCue, suggestedExpirationDate, suggestedShelfLifeDays } from './expirationIntelligence'
import { getFoodIntelligence } from './foodCatalog'

const today = new Date(2026, 9, 9)
const chicken = getFoodIntelligence('chicken breast')!.profile
const beans = getFoodIntelligence('black beans')!.profile

describe('expiration intelligence', () => {
  it('adjusts shelf life for storage and opened foods', () => {
    expect(suggestedShelfLifeDays(chicken, 'Fridge', 'purchased')).toBe(3)
    expect(suggestedShelfLifeDays(chicken, 'Fridge', 'opened')).toBe(2)
    expect(suggestedShelfLifeDays(chicken, 'Freezer', 'purchased')).toBe(90)
    expect(suggestedShelfLifeDays(beans, 'Fridge', 'opened')).toBeNull()
  })

  it('understands opened and purchased cues', () => {
    expect(freshnessCueFromText('milk opened yesterday')).toEqual({ state: 'opened', ageDays: 1 })
    expect(freshnessCueFromText('chicken purchased 2 days ago')).toEqual({ state: 'purchased', ageDays: 2 })
    expect(removeFreshnessCue('milk opened yesterday')).toBe('milk')
    expect(suggestedExpirationDate(chicken, 'Fridge', 'purchased', 2, today)).toBe('2026-10-10')
  })

  it('normalizes common printed expiration date formats', () => {
    expect(expirationDateFromText('USE BY 10/12/26', today)).toBe('2026-10-12')
    expect(expirationDateFromText('best before Oct 14 2026', today)).toBe('2026-10-14')
    expect(expirationDateFromText('expires on 2026-10-18', today)).toBe('2026-10-18')
    expect(expirationDateFromText('use by 13/40/26', today)).toBeNull()
  })

  it('warns about implausible dates and storage', () => {
    expect(expirationWarning('2026-10-08', chicken, 'Fridge', today)).toContain('past')
    expect(expirationWarning('2027-10-09', chicken, 'Fridge', today)).toContain('much longer')
    expect(expirationWarning('2026-10-11', chicken, 'Pantry', today)).toContain('refrigerated')
  })
})
