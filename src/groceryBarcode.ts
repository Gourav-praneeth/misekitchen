import { getFoodIntelligence } from './foodCatalog'
import { normalizeFoodName } from './smartEntry'
import { productMetadata, type BarcodeProduct } from './productIdentity'
import type { GroceryItem, GroceryPurchase } from './types'

function productNames(product: BarcodeProduct) {
  return [product.genericName, product.name].filter((name): name is string => Boolean(name?.trim()))
}

function tokens(value: string) {
  return new Set(normalizeFoodName(value).split(/\s+/).filter((token) => token.length > 1))
}

export function groceryBarcodeMatchScore(item: Pick<GroceryItem, 'name'>, product: BarcodeProduct) {
  const itemName = normalizeFoodName(item.name)
  return productNames(product).reduce((best, name) => {
    const productName = normalizeFoodName(name)
    if (itemName === productName) return Math.max(best, 100)
    if (itemName.includes(productName) || productName.includes(itemName)) return Math.max(best, 80)
    const itemTokens = tokens(itemName)
    const productTokens = tokens(productName)
    const shared = [...itemTokens].filter((token) => productTokens.has(token)).length
    const total = new Set([...itemTokens, ...productTokens]).size
    return Math.max(best, total ? Math.round((shared / total) * 60) : 0)
  }, 0)
}

export function bestGroceryBarcodeMatch(items: GroceryItem[], product: BarcodeProduct) {
  const matches = items.map((item, index) => ({ index, score: groceryBarcodeMatchScore(item, product) }))
    .sort((left, right) => right.score - left.score)
  return matches[0] && matches[0].score >= 40 ? matches[0] : null
}

function purchaseDefaults(item: GroceryItem, product: BarcodeProduct): GroceryPurchase {
  const metadata = productMetadata(product)
  const intelligence = getFoodIntelligence(product.genericName || product.name) || getFoodIntelligence(item.name)
  return {
    ...metadata,
    packageCount: 1,
    packageSize: metadata.packageAmount || item.amount || 1,
    packageUnit: metadata.packageUnit || item.unit || 'pack',
    location: intelligence?.profile.location || 'Pantry',
    expiresOn: null,
  }
}

export function applyBarcodeToGroceryPurchase(item: GroceryItem, product: BarcodeProduct) {
  const next = purchaseDefaults(item, product)
  const repeated = Boolean(item.purchase?.barcode && item.purchase.barcode === next.barcode)
  if (repeated) {
    return {
      ...item,
      checked: true,
      purchase: { ...item.purchase!, packageCount: item.purchase!.packageCount + 1 },
    }
  }
  return {
    ...item,
    checked: true,
    purchase: {
      ...next,
      packageCount: 1,
      location: item.purchase?.location || next.location,
      expiresOn: item.purchase?.expiresOn || next.expiresOn,
    },
  }
}

export function groceryItemFromBarcodeProduct(product: BarcodeProduct): GroceryItem {
  const intelligence = getFoodIntelligence(product.genericName || product.name) || getFoodIntelligence(product.name)
  const name = intelligence?.profile.name || product.genericName?.trim() || product.name.trim() || 'Packaged product'
  const item: GroceryItem = { name, amount: 1, unit: 'pack', checked: true }
  const withPurchase = applyBarcodeToGroceryPurchase(item, product)
  return {
    ...withPurchase,
    amount: withPurchase.purchase?.packageSize || 1,
    unit: withPurchase.purchase?.packageUnit || 'pack',
  }
}

export function barcodeProductFromRemembered(product: {
  barcode: string; name: string; brand?: string | null; productImageUrl?: string | null;
  packageAmount?: number | null; packageUnit?: string | null; productSource?: 'open-food-facts' | 'household' | null
}): BarcodeProduct {
  return {
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    productImageUrl: product.productImageUrl,
    packageAmount: product.packageAmount,
    packageUnit: product.packageUnit,
    productSource: product.productSource || 'household',
  }
}
