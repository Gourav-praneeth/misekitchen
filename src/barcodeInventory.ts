import { suggestedExpirationDate } from './expirationIntelligence'
import { getFoodIntelligence } from './foodCatalog'
import { daysUntilDate } from './freshness'
import { applyProductPackage, normalizeBarcode, type BarcodeProduct } from './productIdentity'
import type { HouseholdProduct, InventoryItem } from './types'

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function inventoryItemFromBarcodeProduct(product: BarcodeProduct, id: string, packageCount = 1): InventoryItem {
  const intelligence = getFoodIntelligence(product.genericName || product.name) || getFoodIntelligence(product.name)
  const profile = intelligence?.profile
  const expiresOn = profile ? suggestedExpirationDate(profile, profile.location, 'purchased') : null
  return applyProductPackage({
    id,
    name: profile?.name || titleCase(product.name || product.genericName || 'Packaged product'),
    emoji: profile?.emoji || '🥫',
    quantity: 1,
    unit: 'pack',
    category: profile?.category || 'Other',
    location: profile?.location || 'Pantry',
    foodGroup: profile?.foodGroup || 'Other',
    storageAreaId: profile?.storageAreaId || 'pantry',
    freshnessPolicy: profile?.freshnessPolicy || 'none',
    expiresIn: daysUntilDate(expiresOn),
    expiresOn,
    barcode: normalizeBarcode(product.barcode),
  }, product, packageCount)
}

export function inventoryItemFromHouseholdProduct(product: HouseholdProduct, id: string): InventoryItem {
  const profile = getFoodIntelligence(product.name)?.profile
  const expiresOn = profile ? suggestedExpirationDate(profile, product.location, 'purchased') : null
  return {
    ...product,
    id,
    quantity: product.packageAmount || 1,
    unit: product.packageUnit || product.unit || 'pack',
    expiresIn: daysUntilDate(expiresOn),
    expiresOn,
    productSource: 'household',
  }
}

export function rememberedInventoryProduct(inventory: InventoryItem[], barcode: string) {
  const normalized = normalizeBarcode(barcode)
  return inventory.find((item) => normalizeBarcode(item.barcode || '') === normalized) || null
}

export function householdProductFromInventory(item: InventoryItem): HouseholdProduct | null {
  const barcode = normalizeBarcode(item.barcode || '')
  if (!barcode) return null
  return {
    barcode,
    name: item.name,
    emoji: item.emoji,
    unit: item.unit,
    category: item.category,
    location: item.location,
    foodGroup: item.foodGroup,
    storageAreaId: item.storageAreaId,
    freshnessPolicy: item.freshnessPolicy,
    brand: item.brand || null,
    productImageUrl: item.productImageUrl || null,
    packageAmount: item.packageAmount || null,
    packageUnit: item.packageUnit || null,
    productSource: 'household',
  }
}

export function rememberHouseholdProducts(current: HouseholdProduct[], items: InventoryItem[]) {
  const remembered = new Map(current.map((item) => [normalizeBarcode(item.barcode), item]))
  items.forEach((item) => {
    const product = householdProductFromInventory(item)
    if (product) remembered.set(product.barcode, product)
  })
  return [...remembered.values()]
}

export function rememberedHouseholdProduct(products: HouseholdProduct[], barcode: string) {
  const normalized = normalizeBarcode(barcode)
  return products.find((item) => normalizeBarcode(item.barcode) === normalized) || null
}
