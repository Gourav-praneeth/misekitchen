import { describe, expect, it } from 'vitest'
import { inventoryItemFromBarcodeProduct, inventoryItemFromHouseholdProduct, rememberedInventoryProduct } from './barcodeInventory'

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

  it('prefers the recognizable package name over an unmatched generic description', () => {
    const item = inventoryItemFromBarcodeProduct({
      barcode: '5449000000996', name: 'Coca-Cola Original', genericName: 'Bebida refrescante aromatizada',
      packageAmount: 330, packageUnit: 'ml', productSource: 'open-food-facts',
    }, 'scan-coke')
    expect(item.name).toBe('Coca-Cola Original')
  })

  it('restores household corrections with a fresh quantity and expiration', () => {
    const item = inventoryItemFromHouseholdProduct({
      barcode: '034000470693', name: 'Milk', emoji: '🥛', unit: 'ml', category: 'Dairy', location: 'Fridge',
      brand: 'Local Dairy', packageAmount: 946, packageUnit: 'ml', productSource: 'household',
    }, 'scan-remembered')
    expect(item).toMatchObject({
      id: 'scan-remembered', name: 'Milk', quantity: 946, unit: 'ml', category: 'Dairy',
      location: 'Fridge', barcode: '034000470693', brand: 'Local Dairy', productSource: 'household',
    })
    expect(item.expiresOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('finds a saved product by its normalized barcode before an external lookup', () => {
    const remembered = inventoryItemFromBarcodeProduct({
      barcode: '034000470693', name: 'Milk', packageAmount: 946, packageUnit: 'ml', productSource: 'household',
    }, 'saved-product')
    expect(rememberedInventoryProduct([remembered], '0 34000-47069 3')?.id).toBe('saved-product')
    expect(rememberedInventoryProduct([remembered], '4006381333931')).toBeNull()
  })
})
