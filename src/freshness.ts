import type { InventoryItem } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

function localDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function toDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function expirationDateFromDays(days: number | null, today = new Date()) {
  if (days === null || !Number.isFinite(days)) return null
  const expiration = localDay(today)
  expiration.setDate(expiration.getDate() + Math.max(0, Math.round(days)))
  return toDateInput(expiration)
}

export function daysUntilDate(expiresOn: string | null | undefined, today = new Date()) {
  if (!expiresOn) return null
  const [year, month, day] = expiresOn.split('-').map(Number)
  if (!year || !month || !day) return null
  const expirationDay = Date.UTC(year, month - 1, day)
  const currentDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((expirationDay - currentDay) / DAY_MS)
}

export function daysUntilExpiration(item: Pick<InventoryItem, 'expiresOn' | 'expiresIn'>, today = new Date()) {
  return daysUntilDate(item.expiresOn, today) ?? item.expiresIn
}

// `expires_on` is the source of truth and can represent dates in the past. The
// original database column is retained for backwards compatibility, but its
// schema only accepts non-negative values.
export function legacyExpirationDaysForStorage(item: Pick<InventoryItem, 'expiresOn' | 'expiresIn'>, today = new Date()) {
  const days = daysUntilExpiration(item, today)
  return days === null ? null : Math.max(0, days)
}

export function withExpirationDate<T extends Pick<InventoryItem, 'expiresOn' | 'expiresIn'>>(item: T, today = new Date()): T {
  if (item.expiresOn || item.expiresIn === null) return item
  return { ...item, expiresOn: expirationDateFromDays(item.expiresIn, today) }
}
