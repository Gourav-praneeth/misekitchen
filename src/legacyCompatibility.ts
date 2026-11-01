import { getFoodIntelligence } from './foodCatalog'
import { normalizeFoodName } from './smartEntry'
import type { Category, GroceryItem, HouseholdFoodMapping, InventoryItem, Location } from './types'
import { foodGroupForLegacyCategory, storageAreaIdForLocation } from './storageAreas'

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
    const storedCategory = categories.has(item.category) ? item.category : intelligence?.profile.category || 'Other'
    const storedLocation = locations.has(item.location) ? item.location : intelligence?.profile.location || 'Pantry'
    // The additive storage migration could only infer modern metadata from the
    // old broad category/location columns. Treat that exact inferred shape as
    // a legacy fallback so the richer catalog can finish the backfill. Modern
    // rows and household mappings retain their explicit choices.
    const usesLegacyMetadata = !item.foodGroup || !item.storageAreaId || !item.freshnessPolicy
      || (item.foodGroup === foodGroupForLegacyCategory(storedCategory)
        && item.storageAreaId === storageAreaIdForLocation(storedLocation))
    const category = intelligence && usesLegacyMetadata ? intelligence.profile.category : storedCategory
    const location = intelligence && usesLegacyMetadata ? intelligence.profile.location : storedLocation
    const foodGroup = intelligence && usesLegacyMetadata ? intelligence.profile.foodGroup : item.foodGroup || foodGroupForLegacyCategory(category)
    const storageAreaId = intelligence && usesLegacyMetadata ? intelligence.profile.storageAreaId : item.storageAreaId || storageAreaIdForLocation(location)
    const freshnessPolicy = intelligence && usesLegacyMetadata ? intelligence.profile.freshnessPolicy : item.freshnessPolicy || 'none'
    const expiresOn = freshnessPolicy === 'none' ? null : item.expiresOn
    const expiresIn = freshnessPolicy === 'none' ? null : item.expiresIn
    const next: InventoryItem = { ...item, id, emoji, quantity: 1, unit: 'item', category, location, foodGroup, storageAreaId, freshnessPolicy, expiresOn, expiresIn }
    if (id !== item.id || emoji !== item.emoji || item.quantity !== 1 || item.unit !== 'item' || category !== item.category || location !== item.location || foodGroup !== item.foodGroup || storageAreaId !== item.storageAreaId || freshnessPolicy !== item.freshnessPolicy || expiresOn !== item.expiresOn || expiresIn !== item.expiresIn) changed = true
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
  const catalog = getFoodIntelligence(item.name)?.profile
  if (mapping) {
    const freshnessPolicy = mapping.freshnessPolicy || catalog?.freshnessPolicy || item.freshnessPolicy
    return {
      ...item,
      name: mapping.displayName,
      emoji: mapping.emoji,
      category: mapping.category,
      location: mapping.location,
      foodGroup: mapping.foodGroup || catalog?.foodGroup || item.foodGroup,
      storageAreaId: mapping.storageAreaId || storageAreaIdForLocation(mapping.location) || catalog?.storageAreaId || item.storageAreaId,
      freshnessPolicy,
      ...(freshnessPolicy === 'none' ? { expiresOn: null, expiresIn: null } : {}),
    }
  }
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
    additions.push({ normalizedName, displayName: item.name.trim(), emoji: item.emoji, category: item.category, location: item.location, foodGroup: item.foodGroup, storageAreaId: item.storageAreaId, freshnessPolicy: item.freshnessPolicy })
  })
  return additions
}
