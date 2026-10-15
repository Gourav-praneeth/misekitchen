import { describe, expect, it } from 'vitest'
import { inventoryItemFromBarcodeProduct } from './barcodeInventory'

describe('barcode inventory review', () => {
  it('maps a branded package to the generic food intelligence profile', () => {
    const item = inventoryItemFromBarcodeProduct({
      barcode: '034000470693', name: 'Organic Whole Milk', genericName: 'Milk', brand: 'Test Dairy',
      packageAmount: 946, packageUnit: 'ml', productSource: 'open-food-facts',
    }, 'scan-1')
    expect(item).toMatchObject({
      id: 'scan-1', name: 'Milk', emoji: '🥛', quantity: 946, unit: 'ml', category: 'Dairy',
      location: 'Fridge', barcode: '034000470693', brand: 'Test Dairy', packageAmount: 946, packageUnit: 'ml',
    })
  })

  it('keeps an unknown product editable and household-scoped', () => {
    const item = inventoryItemFromBarcodeProduct({
      barcode: '4006381333931', name: 'Mystery snack', quantityText: '2 x 50 g', productSource: 'household',
    }, 'scan-2')
    expect(item).toMatchObject({ name: 'Mystery Snack', quantity: 100, unit: 'g', category: 'Other', location: 'Pantry', productSource: 'household' })
  })
})
