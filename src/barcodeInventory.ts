import { suggestedExpirationDate } from './expirationIntelligence'
import { getFoodIntelligence } from './foodCatalog'
import { daysUntilDate } from './freshness'
import { applyProductPackage, normalizeBarcode, type BarcodeProduct } from './productIdentity'
import type { InventoryItem } from './types'

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function inventoryItemFromBarcodeProduct(product: BarcodeProduct, id: string, packageCount = 1): InventoryItem {
  const intelligence = getFoodIntelligence(product.genericName || product.name) || getFoodIntelligence(product.name)
  const profile = intelligence?.profile
  const expiresOn = profile ? suggestedExpirationDate(profile, profile.location, 'purchased') : null
  return applyProductPackage({
    id,
    name: profile?.name || titleCase(product.genericName || product.name || 'Packaged product'),
    emoji: profile?.emoji || '🥫',
    quantity: 1,
    unit: 'pack',
    category: profile?.category || 'Other',
    location: profile?.location || 'Pantry',
    expiresIn: daysUntilDate(expiresOn),
    expiresOn,
    barcode: normalizeBarcode(product.barcode),
  }, product, packageCount)
}
