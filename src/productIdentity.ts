import { normalizeMeasurementUnit } from './measurements'
import type { InventoryItem, ProductMetadata } from './types'

export type PackageQuantity = {
  amount: number
  unit: string
  packageAmount: number
  packageCount: number
}

export type BarcodeProduct = ProductMetadata & {
  barcode: string
  name: string
  genericName?: string | null
  quantityText?: string | null
}

const supportedBarcodeLengths = new Set([8, 12, 13, 14])
const quantityUnit = '(fl\\s*oz|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l|milligrams?|mg|kilograms?|kg|grams?|g|ounces?|oz|pounds?|lbs?|lb|count|ct|items?|pieces?|eggs?|dozen)'

export function normalizeBarcode(value: string) {
  return value.replace(/[^0-9]/g, '')
}

export function isValidBarcode(value: string) {
  const barcode = normalizeBarcode(value)
  if (!supportedBarcodeLengths.has(barcode.length)) return false
  const digits = [...barcode].map(Number)
  const checkDigit = digits.pop()!
  const sum = digits.reduce((total, digit, index) => {
    const positionFromRight = digits.length - index
    return total + digit * (positionFromRight % 2 === 1 ? 3 : 1)
  }, 0)
  return (10 - (sum % 10)) % 10 === checkDigit
}

function normalizedPackageUnit(unit: string) {
  const normalized = unit.toLowerCase().replace(/\s+/g, ' ').trim()
  if (normalized === 'dozen') return 'items'
  if (['count', 'ct', 'item', 'items', 'piece', 'pieces', 'egg', 'eggs'].includes(normalized)) return 'items'
  return normalizeMeasurementUnit(normalized)
}

export function parsePackageQuantity(value?: string | null): PackageQuantity | null {
  if (!value) return null
  const text = value.toLowerCase().replace(/,/g, '.').replace(/×/g, 'x').trim()
  const multipack = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*x\\s*(\\d+(?:\\.\\d+)?)\\s*${quantityUnit}\\b`, 'i'))
  if (multipack) {
    const packageCount = Number(multipack[1])
    const packageAmount = Number(multipack[2])
    const unit = normalizedPackageUnit(multipack[3])
    if (packageCount > 0 && packageAmount > 0) return { amount: packageCount * packageAmount, unit, packageAmount, packageCount }
  }

  const single = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${quantityUnit}\\b`, 'i'))
  if (!single) return null
  let packageAmount = Number(single[1])
  const unit = normalizedPackageUnit(single[2])
  if (single[2].toLowerCase() === 'dozen') packageAmount *= 12
  if (packageAmount <= 0) return null
  return { amount: packageAmount, unit, packageAmount, packageCount: 1 }
}

export function productMetadata(product: BarcodeProduct): ProductMetadata {
  const barcode = normalizeBarcode(product.barcode)
  const parsed = product.packageAmount && product.packageUnit
    ? { amount: product.packageAmount, unit: normalizedPackageUnit(product.packageUnit) }
    : parsePackageQuantity(product.quantityText)
  return {
    barcode,
    brand: product.brand?.trim() || null,
    productImageUrl: product.productImageUrl?.trim() || null,
    packageAmount: parsed?.amount ?? null,
    packageUnit: parsed?.unit ?? null,
    productSource: product.productSource || 'open-food-facts',
  }
}

export function applyProductPackage(item: InventoryItem, product: BarcodeProduct, packageCount = 1): InventoryItem {
  const metadata = productMetadata(product)
  const validCount = Number.isFinite(packageCount) && packageCount > 0 ? packageCount : 1
  return {
    ...item,
    ...metadata,
    quantity: metadata.packageAmount && metadata.packageUnit ? metadata.packageAmount * validCount : validCount,
    unit: metadata.packageUnit || 'pack',
  }
}

export function mergeProductMetadata(current: InventoryItem, incoming: InventoryItem): ProductMetadata {
  return {
    barcode: incoming.barcode || current.barcode || null,
    brand: incoming.brand || current.brand || null,
    productImageUrl: incoming.productImageUrl || current.productImageUrl || null,
    packageAmount: incoming.packageAmount || current.packageAmount || null,
    packageUnit: incoming.packageUnit || current.packageUnit || null,
    productSource: incoming.productSource || current.productSource || null,
  }
}
