import { expirationDateFromDays, withExpirationDate } from './freshness'
import { getFoodIntelligence } from './foodCatalog'
import { normalizeFoodName, parseSmartEntry, sameFoodAndUnit } from './smartEntry'
import type { Category, GroceryItem, InventoryItem } from './types'
import { mergeProductMetadata } from './productIdentity'
import { collapseInventoryPresence } from './inventoryPresence'
import { convertAmount } from './measurements'
import { legacyCategoryForFoodGroup } from './storageAreas'

const genericUnits = new Set(['item', 'items'])

function inferredUnit(name: string, unit: string) {
  if (!genericUnits.has(unit.trim().toLowerCase())) return unit
  return getFoodIntelligence(name)?.profile.defaultUnit || unit
}

function earlierExpiration(current: InventoryItem, incoming: InventoryItem) {
  const currentDate = current.expiresOn || expirationDateFromDays(current.expiresIn)
  const incomingDate = incoming.expiresOn || expirationDateFromDays(incoming.expiresIn)
  if (!incomingDate || (currentDate && currentDate <= incomingDate)) return current
  return { ...current, expiresOn: incomingDate, expiresIn: incoming.expiresIn }
}

export function mergeInventoryItems(current: InventoryItem[], incoming: InventoryItem[]) {
  const items = collapseInventoryPresence(current)
  let merged = 0
  let added = 0

  incoming.forEach((candidate) => {
    const prepared = withExpirationDate({ ...candidate, quantity: 1, unit: 'item' })
    const existingIndex = items.findIndex((item) => normalizeFoodName(item.name) === normalizeFoodName(prepared.name))
    if (existingIndex < 0) {
      items.push(prepared)
      added += 1
      return
    }

    const existing = items[existingIndex]
    const withSoonerDate = earlierExpiration(existing, prepared)
    items[existingIndex] = {
      ...withSoonerDate,
      ...mergeProductMetadata(existing, prepared),
      quantity: 1,
      unit: 'item',
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

export function groceryItemsFromText(value: string): GroceryItem[] {
  return parseSmartEntry(value).map((item) => ({
    name: item.name,
    amount: item.quantity,
    unit: item.unit,
    checked: false,
  }))
}

export function groceryCategory(item: Pick<GroceryItem, 'name' | 'category'>): Category {
  return item.category || getFoodIntelligence(item.name)?.profile.category || 'Other'
}

export function groceryEmoji(item: Pick<GroceryItem, 'name' | 'emoji'>) {
  return item.emoji || getFoodIntelligence(item.name)?.profile.emoji || '🛒'
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
      if (prepared.category) existing.category = prepared.category
      if (!existing.checked) existing.purchase = undefined
    } else {
      items.push(prepared)
    }
  })
  return items
}

export function purchasedGroceryAmount(item: GroceryItem) {
  const purchase = item.purchase
  if (!purchase || purchase.packageCount <= 0 || purchase.packageSize <= 0 || !purchase.packageUnit.trim()) {
    return { amount: item.amount, unit: item.unit }
  }
  return {
    amount: Number((purchase.packageCount * purchase.packageSize).toFixed(3)),
    unit: purchase.packageUnit,
  }
}

export function inventoryItemFromGrocery(item: GroceryItem, id: string): InventoryItem {
  const intelligence = getFoodIntelligence(item.name)
  const profile = intelligence?.profile
  const freshnessPolicy = item.purchase?.freshnessPolicy || profile?.freshnessPolicy || 'none'
  const expiresIn = freshnessPolicy === 'none' ? null : profile?.shelfLifeDays ?? null
  const expiresOn = freshnessPolicy === 'none' ? null : item.purchase?.expiresOn || expirationDateFromDays(expiresIn)
  return withExpirationDate({
    id,
    name: profile?.name || item.name.trim(),
    emoji: profile?.emoji || '🥫',
    quantity: 1,
    unit: 'item',
    category: legacyCategoryForFoodGroup(item.purchase?.foodGroup || profile?.foodGroup || 'Other'),
    location: item.purchase?.location || profile?.location || 'Pantry',
    foodGroup: item.purchase?.foodGroup || profile?.foodGroup || 'Other',
    storageAreaId: item.purchase?.storageAreaId || profile?.storageAreaId || 'pantry',
    freshnessPolicy,
    expiresIn,
    expiresOn,
    barcode: item.purchase?.barcode || null,
    brand: item.purchase?.brand || null,
    productImageUrl: item.purchase?.productImageUrl || null,
    packageAmount: item.purchase?.packageAmount || item.purchase?.packageSize || null,
    packageUnit: item.purchase?.packageUnit || null,
    productSource: item.purchase?.productSource || null,
  })
}
