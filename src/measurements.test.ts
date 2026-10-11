import { describe, expect, it } from 'vitest'
import { availableAmount, convertAmount, deductIngredients, formatAmount } from './measurements'
import type { InventoryItem } from './types'

const milk: InventoryItem = { id: 'milk', name: 'Milk', emoji: '🥛', quantity: 1000, unit: 'ml', category: 'Dairy', location: 'Fridge', expiresIn: 5 }

describe('universal measurements', () => {
  it('converts volume and mass units', () => {
    expect(convertAmount(0.5, 'cups', 'ml')).toBeCloseTo(118.294, 2)
    expect(convertAmount(21, 'oz', 'g')).toBeCloseTo(595.34, 1)
    expect(convertAmount(1, 'cups', 'g')).toBeNull()
  })

  it('matches and deducts a recipe amount in a different unit', () => {
    expect(availableAmount([milk], { name: 'Milk', unit: 'cups' }, (value) => value.toLowerCase())).toBeCloseTo(4.22675, 4)
    const [remaining] = deductIngredients([milk], [{ name: 'Milk', amount: 0.5, unit: 'cups' }], 1, (value) => value.toLowerCase())
    expect(remaining.quantity).toBe(881.71)
    expect(remaining.unit).toBe('ml')
  })

  it('shows fractional amounts with up to two decimal places', () => {
    expect(formatAmount(1 / 4)).toBe('0.25')
    expect(formatAmount(1 / 2)).toBe('0.50')
    expect(formatAmount(2 / 3)).toBe('0.67')
    expect(formatAmount(2)).toBe('2')
  })
})
