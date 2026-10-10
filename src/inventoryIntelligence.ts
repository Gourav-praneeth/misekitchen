import { expirationDateFromDays, withExpirationDate } from './freshness'
import { getFoodIntelligence } from './foodCatalog'
import { parseSmartEntry, sameFoodAndUnit } from './smartEntry'
import type { GroceryItem, InventoryItem } from './types'
import { convertAmount } from './measurements'

const genericUnits = new Set(['item', 'items'])

function inferredUnit(name: string, unit: string) {
  if (!genericUnits.has(unit.trim().toLowerCase())) return unit
  return getFoodIntelligence(name)?.profile.defaultUnit || unit
}

function comparable(item: Pick<InventoryItem, 'name' | 'unit'>) {
  return { name: item.name, unit: inferredUnit(item.name, item.unit) }
}

function earlierExpiration(current: InventoryItem, incoming: InventoryItem) {
  const currentDate = current.expiresOn || expirationDateFromDays(current.expiresIn)
  const incomingDate = incoming.expiresOn || expirationDateFromDays(incoming.expiresIn)
  if (!incomingDate || (currentDate && currentDate <= incomingDate)) return current
  return { ...current, expiresOn: incomingDate, expiresIn: incoming.expiresIn }
}

export function mergeInventoryItems(current: InventoryItem[], incoming: InventoryItem[]) {
  const items = current.map((item) => ({ ...item }))
  let merged = 0
  let added = 0

  incoming.forEach((candidate) => {
    const prepared = withExpirationDate({ ...candidate, unit: inferredUnit(candidate.name, candidate.unit) })
    const existingIndex = items.findIndex((item) => sameFoodAndUnit(comparable(item), comparable(prepared)))
    if (existingIndex < 0) {
      items.push(prepared)
      added += 1
      return
    }

    const existing = items[existingIndex]
    const withSoonerDate = earlierExpiration(existing, prepared)
    items[existingIndex] = {
      ...withSoonerDate,
      quantity: Number((existing.quantity + (convertAmount(prepared.quantity, prepared.unit, existing.unit) || 0)).toFixed(3)),
    }
    merged += 1
  })

  return { items, merged, added }
}

export function groceryItemFromText(value: string): GroceryItem | null {
  const parsed = parseSmartEntry(value)[0]
  if (!parsed) return null
  return { name: parsed.name, amount: parsed.quantity, unit: parsed.unit, checked: false }
}

export function groceryEmoji(item: Pick<GroceryItem, 'name'>) {
  return getFoodIntelligence(item.name)?.profile.emoji || '🛒'
}

export function mergeGroceryItems(current: GroceryItem[], incoming: GroceryItem[]) {
  const items = current.map((item) => ({ ...item }))
  incoming.forEach((candidate) => {
    const prepared = { ...candidate, unit: inferredUnit(candidate.name, candidate.unit) }
    const existing = items.find((item) => sameFoodAndUnit(
      { name: item.name, unit: inferredUnit(item.name, item.unit) },
      { name: prepared.name, unit: prepared.unit },
    ))
    if (existing) {
      existing.amount = Math.max(existing.amount, convertAmount(prepared.amount, prepared.unit, existing.unit) || 0)
      existing.checked = existing.checked && prepared.checked
    } else {
      items.push(prepared)
    }
  })
  return items
}

export function inventoryItemFromGrocery(item: GroceryItem, id: string): InventoryItem {
  const intelligence = getFoodIntelligence(item.name)
  const profile = intelligence?.profile
  const expiresIn = profile?.shelfLifeDays ?? null
  return withExpirationDate({
    id,
    name: profile?.name || item.name.trim(),
    emoji: profile?.emoji || '🥫',
    quantity: item.amount,
    unit: inferredUnit(item.name, item.unit),
    category: profile?.category || 'Other',
    location: profile?.location || 'Pantry',
    expiresIn,
    expiresOn: expirationDateFromDays(expiresIn),
  })
}
