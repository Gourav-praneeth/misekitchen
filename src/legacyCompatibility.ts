import { getFoodIntelligence } from './foodCatalog'
import { normalizeFoodName } from './smartEntry'
import type { Category, GroceryItem, HouseholdFoodMapping, InventoryItem, Location } from './types'

const genericIcons = new Set(['', '🥫', '🛒', '📦'])
const categories = new Set<Category>(['Protein', 'Produce', 'Dairy', 'Pantry', 'Other'])
const locations = new Set<Location>(['Fridge', 'Freezer', 'Pantry'])

function slug(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
}

export function normalizeLegacyInventory(items: InventoryItem[]) {
  let changed = false
  const ids = new Set<string>()
  const normalized = items.map((item) => {
    const intelligence = getFoodIntelligence(item.name)
    const baseId = typeof item.id === 'string' && item.id.trim()
      ? item.id
      : `legacy-inventory-${slug(item.name)}-${slug(item.location)}`
    let id = baseId
    let suffix = 2
    while (ids.has(id)) { id = `${baseId}-${suffix}`; suffix += 1 }
    ids.add(id)
    const emoji = typeof item.emoji === 'string' && item.emoji.trim() ? item.emoji : intelligence?.profile.emoji || '🥫'
    const category = categories.has(item.category) ? item.category : intelligence?.profile.category || 'Other'
    const location = locations.has(item.location) ? item.location : intelligence?.profile.location || 'Pantry'
    const next: InventoryItem = { ...item, id, emoji, quantity: 1, unit: 'item', category, location }
    if (id !== item.id || emoji !== item.emoji || item.quantity !== 1 || item.unit !== 'item' || category !== item.category || location !== item.location) changed = true
    return next
  })
  return { items: normalized, changed }
}

export function normalizeLegacyGrocery(items: GroceryItem[]) {
  let changed = false
  const ids = new Set<string>()
  const normalized = items.map((item) => {
    const unit = typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : getFoodIntelligence(item.name)?.profile.defaultUnit || 'item'
    const amount = Number.isFinite(Number(item.amount)) && Number(item.amount) > 0 ? Number(item.amount) : 1
    const baseId = typeof item.id === 'string' && item.id.trim() ? item.id : `legacy-grocery-${slug(item.name)}-${slug(unit)}`
    let id = baseId
    let suffix = 2
    while (ids.has(id)) { id = `${baseId}-${suffix}`; suffix += 1 }
    ids.add(id)
    const next: GroceryItem = { ...item, id, amount, unit, checked: Boolean(item.checked) }
    if (id !== item.id || amount !== item.amount || unit !== item.unit || next.checked !== item.checked) changed = true
    return next
  })
  return { items: normalized, changed }
}

export function resolveInventoryPresentation(item: InventoryItem, mappings: HouseholdFoodMapping[]) {
  const normalizedName = normalizeFoodName(item.name)
  const mapping = mappings.find((candidate) => candidate.normalizedName === normalizedName)
  if (mapping) return { ...item, name: mapping.displayName, emoji: mapping.emoji, category: mapping.category, location: mapping.location }
  const catalog = getFoodIntelligence(item.name)?.profile
  if (catalog) return { ...item, emoji: catalog.emoji }
  return { ...item, emoji: genericIcons.has(item.emoji || '') ? '🥫' : item.emoji }
}

export function resolveGroceryPresentation(item: GroceryItem, mappings: HouseholdFoodMapping[]) {
  const mapping = mappings.find((candidate) => candidate.normalizedName === normalizeFoodName(item.name))
  if (mapping) return { ...item, name: mapping.displayName, emoji: mapping.emoji }
  const catalog = getFoodIntelligence(item.name)?.profile
  if (catalog) return { ...item, emoji: catalog.emoji }
  return { ...item, emoji: genericIcons.has(item.emoji || '') ? '🛒' : item.emoji }
}

export function legacyFoodMappings(inventory: InventoryItem[], mappings: HouseholdFoodMapping[]) {
  const known = new Set(mappings.map((mapping) => mapping.normalizedName))
  const additions: HouseholdFoodMapping[] = []
  inventory.forEach((item) => {
    const normalizedName = normalizeFoodName(item.name)
    if (!normalizedName || known.has(normalizedName) || getFoodIntelligence(item.name) || genericIcons.has(item.emoji || '')) return
    known.add(normalizedName)
    additions.push({ normalizedName, displayName: item.name.trim(), emoji: item.emoji, category: item.category, location: item.location })
  })
  return additions
}
