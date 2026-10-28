import type { FoodProfile } from './foodCatalog'
import { daysUntilDate, expirationDateFromDays, toDateInput } from './freshness'
import type { Category, Location } from './types'

export type FreshnessState = 'purchased' | 'opened'

export type FreshnessCue = {
  state: FreshnessState
  ageDays: number
}

const openedCaps: Record<Category, number> = {
  Protein: 2,
  Produce: 4,
  Dairy: 7,
  Pantry: 90,
  Other: 14,
}

const frozenDays: Record<Category, number> = {
  Protein: 90,
  Produce: 90,
  Dairy: 60,
  Pantry: 180,
  Other: 60,
}

export function suggestedShelfLifeDays(profile: FoodProfile, location: Location, state: FreshnessState = 'purchased') {
  if (profile.freshnessPolicy === 'none') return null
  const base = profile.shelfLifeDays
  if (base === null) return null
  if (location === 'Freezer') return state === 'opened' ? Math.min(frozenDays[profile.category], 60) : Math.max(base, frozenDays[profile.category])

  let days = base
  if (location === 'Fridge' && profile.location === 'Pantry') {
    if (profile.defaultUnit === 'can' || profile.defaultUnit === 'carton') days = 5
    else if (profile.defaultUnit === 'jar') days = 14
    else days = Math.min(base, 30)
  }
  if (location === 'Pantry' && profile.location === 'Fridge') days = Math.min(base, 2)

  if (state === 'opened') {
    const cap = profile.category === 'Pantry' && ['can', 'carton'].includes(profile.defaultUnit) ? 5
      : profile.category === 'Pantry' && ['jar', 'bottle'].includes(profile.defaultUnit) ? 30
        : openedCaps[profile.category]
    days = Math.min(days, cap)
  }
  return Math.max(1, days)
}

export function suggestedExpirationDate(profile: FoodProfile, location: Location, state: FreshnessState = 'purchased', ageDays = 0, today = new Date()) {
  const shelfLife = suggestedShelfLifeDays(profile, location, state)
  return shelfLife === null ? null : expirationDateFromDays(Math.max(0, shelfLife - ageDays), today)
}

export function freshnessCueFromText(value: string): FreshnessCue {
  if (/\bopened\s+yesterday\b/i.test(value)) return { state: 'opened', ageDays: 1 }
  const openedAgo = value.match(/\bopened\s+(\d+)\s+days?\s+ago\b/i)
  if (openedAgo) return { state: 'opened', ageDays: Number(openedAgo[1]) }
  if (/\bopened(?:\s+today)?\b/i.test(value)) return { state: 'opened', ageDays: 0 }
  if (/\b(?:bought|purchased)\s+yesterday\b/i.test(value)) return { state: 'purchased', ageDays: 1 }
  const purchasedAgo = value.match(/\b(?:bought|purchased)\s+(\d+)\s+days?\s+ago\b/i)
  if (purchasedAgo) return { state: 'purchased', ageDays: Number(purchasedAgo[1]) }
  return { state: 'purchased', ageDays: 0 }
}

export function removeFreshnessCue(value: string) {
  return value
    .replace(/\bopened(?:\s+(?:today|yesterday|\d+\s+days?\s+ago))?\b/gi, '')
    .replace(/\b(?:bought|purchased)\s+(?:today|yesterday|\d+\s+days?\s+ago)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDateToken(value: string, today: Date) {
  function validDate(year: number, month: number, day: number) {
    const date = new Date(year, month - 1, day)
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? toDateInput(date) : null
  }
  const token = value.trim().replace(/,$/, '')
  const iso = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const numeric = token.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (numeric) {
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3])
    return validDate(year, Number(numeric[1]), Number(numeric[2]))
  }

  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const named = token.match(/^([a-z]{3,9})\s+(\d{1,2})(?:\s+(\d{2}|\d{4}))?$/i)
  if (named) {
    const month = months.indexOf(named[1].slice(0, 3).toLowerCase())
    if (month >= 0) {
      const rawYear = named[3] ? Number(named[3]) : today.getFullYear()
      const year = rawYear < 100 ? 2000 + rawYear : rawYear
      return validDate(year, month + 1, Number(named[2]))
    }
  }
  return null
}

export function expirationDateFromText(value: string, today = new Date()) {
  const match = value.match(/\b(?:use[ -]?by|best before|best by|exp(?:ires?|iration)?)(?:\s+on)?[:\s]+(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})|[a-z]{3,9}\s+\d{1,2}(?:\s+\d{2,4})?)/i)
  return match ? parseDateToken(match[1], today) : null
}

export function removeExpirationDateText(value: string) {
  return value.replace(/\b(?:use[ -]?by|best before|best by|exp(?:ires?|iration)?)(?:\s+on)?[:\s]+(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})|[a-z]{3,9}\s+\d{1,2}(?:\s+\d{2,4})?)/gi, '').trim()
}

export function expirationWarning(expiresOn: string | null | undefined, profile: FoodProfile | null | undefined, location: Location, today = new Date()) {
  const days = daysUntilDate(expiresOn, today)
  if (days === null) return null
  if (days < 0) return 'The detected use-by date is in the past. Check the package before saving.'
  if (days > 730) return 'The detected date is more than two years away. Check that the year was read correctly.'
  if (!profile) return null
  const expected = suggestedShelfLifeDays(profile, location, 'purchased')
  if (expected !== null && days > Math.max(expected * 4, expected + 30)) {
    return `This is much longer than the usual ${expected}-day ${location.toLowerCase()} estimate. Check the detected date.`
  }
  if (location === 'Pantry' && profile.location === 'Fridge') {
    return `${profile.name} is usually refrigerated. Confirm the storage location.`
  }
  return null
}
