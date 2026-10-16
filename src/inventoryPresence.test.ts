import { describe, expect, it } from 'vitest'
import { collapseInventoryPresence, hasIngredient, removeIngredients } from './inventoryPresence'
import type { InventoryItem } from './types'

const milk = (id: string, quantity: number, unit: string, expiresOn: string): InventoryItem => ({
  id, name: 'Milk', emoji: '🥛', quantity, unit, category: 'Dairy', location: 'Fridge', expiresIn: null, expiresOn,
})

describe('presence-based inventory', () => {
  it('matches an ingredient without considering quantity or unit', () => {
    expect(hasIngredient([milk('milk', 1, 'ml', '2026-10-20')], { name: 'milk' })).toBe(true)
  })

  it('collapses legacy duplicates and retains the nearest expiration', () => {
    const result = collapseInventoryPresence([
      milk('first', 1000, 'ml', '2026-10-20'),
      { ...milk('second', 2, 'cartons', '2026-10-18'), brand: 'Local Dairy' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'first', quantity: 1, unit: 'item', expiresOn: '2026-10-18', brand: 'Local Dairy' })
  })

  it('changes nothing when cooking reports no restocks and removes only selected ingredients', () => {
    const inventory = [milk('milk', 1000, 'ml', '2026-10-20'), { ...milk('eggs', 12, 'whole', '2026-10-18'), name: 'Eggs' }]
    expect(removeIngredients(inventory, [])).toEqual(inventory)
    expect(removeIngredients(inventory, [{ name: 'egg' }]).map((item) => item.name)).toEqual(['Milk'])
  })
})
