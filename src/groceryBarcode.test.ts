import { describe, expect, it } from 'vitest'
import { applyBarcodeToGroceryPurchase, bestGroceryBarcodeMatch, groceryBarcodeMatchScore, groceryItemFromBarcodeProduct } from './groceryBarcode'
import type { GroceryItem } from './types'

const milk = { barcode: '034000470693', name: 'Organic Whole Milk', genericName: 'Milk', brand: 'Test Dairy', packageAmount: 946, packageUnit: 'ml', productSource: 'open-food-facts' as const }

describe('barcode-assisted grocery purchases', () => {
  it('matches a branded product using its generic food name', () => {
    const items: GroceryItem[] = [
      { name: 'Almonds', amount: 6, unit: 'items', checked: true },
      { name: 'Milk', amount: 0.67, unit: 'cups', checked: true },
    ]
    expect(groceryBarcodeMatchScore(items[1], milk)).toBe(100)
    expect(bestGroceryBarcodeMatch(items, milk)).toEqual({ index: 1, score: 100 })
  })

  it('fills actual package details and counts repeated scans', () => {
    const item: GroceryItem = { name: 'Milk', amount: 0.67, unit: 'cups', checked: true }
    const first = applyBarcodeToGroceryPurchase(item, milk)
    const corrected = { ...first, purchase: { ...first.purchase!, packageSize: 1000, expiresOn: '2026-10-20' } }
    const second = applyBarcodeToGroceryPurchase(corrected, milk)
    expect(second.purchase).toMatchObject({ barcode: milk.barcode, brand: 'Test Dairy', packageCount: 2, packageSize: 1000, packageUnit: 'ml', location: 'Fridge', expiresOn: '2026-10-20' })
  })

  it('creates an editable collected item for an unplanned scanned product', () => {
    expect(groceryItemFromBarcodeProduct({ barcode: '4006381333931', name: 'Roasted Almonds', genericName: 'Almonds', packageAmount: 500, packageUnit: 'g' })).toMatchObject({
      name: 'Almonds', amount: 500, unit: 'g', checked: true,
      purchase: { barcode: '4006381333931', packageCount: 1, packageSize: 500, packageUnit: 'g', location: 'Pantry' },
    })
  })
})
