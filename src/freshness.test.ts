import { describe, expect, it } from 'vitest'
import { daysUntilDate, expirationDateFromDays, withExpirationDate } from './freshness'

const today = new Date(2026, 9, 6, 15, 30)

describe('calendar freshness', () => {
  it('creates a stable date from a shelf-life estimate', () => {
    expect(expirationDateFromDays(3, today)).toBe('2026-10-09')
  })

  it('calculates days from calendar dates instead of elapsed hours', () => {
    expect(daysUntilDate('2026-10-09', today)).toBe(3)
    expect(daysUntilDate('2026-10-05', today)).toBe(-1)
  })

  it('does not gain a day when a range crosses daylight-saving time', () => {
    expect(daysUntilDate('2027-01-04', today)).toBe(90)
  })

  it('upgrades legacy inventory without changing shelf-stable food', () => {
    expect(withExpirationDate({ expiresIn: 2, expiresOn: undefined }, today).expiresOn).toBe('2026-10-08')
    expect(withExpirationDate({ expiresIn: null, expiresOn: undefined }, today).expiresOn).toBeUndefined()
  })
})
