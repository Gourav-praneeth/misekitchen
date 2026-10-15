import { describe, expect, it } from 'vitest'
import { applyProductPackage, isValidBarcode, normalizeBarcode, parsePackageQuantity, productMetadata } from './productIdentity'
import type { InventoryItem } from './types'

const milk: InventoryItem = {
  id: 'milk', name: 'Milk', emoji: '🥛', quantity: 1, unit: 'carton', category: 'Dairy', location: 'Fridge', expiresIn: 7,
}

describe('barcode product foundation', () => {
  it('normalizes and validates common GTIN and UPC codes', () => {
    expect(normalizeBarcode('0 34000-47069 3')).toBe('034000470693')
    expect(isValidBarcode('034000470693')).toBe(true)
    expect(isValidBarcode('4006381333931')).toBe(true)
    expect(isValidBarcode('4006381333932')).toBe(false)
    expect(isValidBarcode('12345')).toBe(false)
  })

  it('turns multipacks into a universal total quantity', () => {
    expect(parsePackageQuantity('2 × 500 ml')).toEqual({ amount: 1000, unit: 'ml', packageAmount: 500, packageCount: 2 })
    expect(parsePackageQuantity('6 x 12 fl oz')).toEqual({ amount: 72, unit: 'fl oz', packageAmount: 12, packageCount: 6 })
    expect(parsePackageQuantity('12 eggs')).toEqual({ amount: 12, unit: 'items', packageAmount: 12, packageCount: 1 })
    expect(parsePackageQuantity('1 dozen')).toEqual({ amount: 12, unit: 'items', packageAmount: 12, packageCount: 1 })
  })

  it('retains product identity while using package contents as inventory quantity', () => {
    const product = {
      barcode: '034000470693', name: 'Whole Milk', brand: 'Test Dairy', quantityText: '1 L',
      productImageUrl: 'https://images.example/milk.jpg', productSource: 'open-food-facts' as const,
    }
    expect(productMetadata(product)).toMatchObject({ barcode: '034000470693', brand: 'Test Dairy', packageAmount: 1, packageUnit: 'L' })
    expect(applyProductPackage(milk, product, 2)).toMatchObject({
      barcode: '034000470693', brand: 'Test Dairy', quantity: 2, unit: 'L', packageAmount: 1, packageUnit: 'L',
    })
  })
})
