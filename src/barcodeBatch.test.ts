import { describe, expect, it } from 'vitest'
import { addBarcodeBatchItem, barcodeBatchLabel, removeBarcodeBatchItem } from './barcodeBatch'
import type { InventoryItem } from './types'

const nutella: InventoryItem = {
  id: 'nutella-1', name: 'Nutella', emoji: '🥫', quantity: 400, unit: 'g', category: 'Other', location: 'Pantry',
  expiresIn: null, barcode: '3017624010701', brand: 'Ferrero', packageAmount: 400, packageUnit: 'g', productSource: 'household',
}

describe('barcode scan batch', () => {
  it('adds different products to the review queue', () => {
    const milk = { ...nutella, id: 'milk-1', name: 'Milk', barcode: '034000470693', quantity: 946, unit: 'ml' }
    expect(addBarcodeBatchItem([nutella], milk)).toHaveLength(2)
  })

  it('combines repeated scans of the same barcode', () => {
    const repeated = { ...nutella, id: 'nutella-2' }
    const items = addBarcodeBatchItem([nutella], repeated)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'nutella-1', quantity: 1, unit: 'item', barcode: '3017624010701' })
  })

  it('removes a mistake without changing the remaining scans', () => {
    const milk = { ...nutella, id: 'milk-1', name: 'Milk', barcode: '034000470693' }
    expect(removeBarcodeBatchItem([nutella, milk], 'nutella-1')).toEqual([milk])
  })

  it('uses clear singular and plural labels', () => {
    expect(barcodeBatchLabel(1)).toBe('1 product')
    expect(barcodeBatchLabel(3)).toBe('3 products')
  })
})
