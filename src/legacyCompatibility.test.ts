import { describe, expect, it } from 'vitest'
import { legacyFoodMappings, normalizeLegacyGrocery, normalizeLegacyInventory, resolveGroceryPresentation, resolveInventoryPresentation } from './legacyCompatibility'
import type { HouseholdFoodMapping, InventoryItem } from './types'

const legacyInventory = { name: 'Harissa paste', emoji: '🌶️', quantity: 3, unit: 'jars', category: 'Pantry', location: 'Fridge', expiresIn: 10 } as InventoryItem

describe('legacy kitchen compatibility', () => {
  it('preserves existing ids and creates stable ids for older rows without them', () => {
    const existing = { ...legacyInventory, id: 'existing-id' }
    const first = normalizeLegacyInventory([existing, legacyInventory])
    const second = normalizeLegacyInventory([existing, legacyInventory])
    expect(first.items[0].id).toBe('existing-id')
    expect(first.items[1].id).toBe(second.items[1].id)
    expect(first.items[1]).toMatchObject({ quantity: 1, unit: 'item' })
  })

  it('assigns unique deterministic ids to legacy grocery rows', () => {
    const legacy = { name: 'Harissa paste', amount: 1, unit: 'jar', checked: false }
    const result = normalizeLegacyGrocery([legacy, legacy])
    expect(result.items.map((item) => item.id)).toEqual(['legacy-grocery-harissa-paste-jar', 'legacy-grocery-harissa-paste-jar-2'])
  })

  it('clears misleading dates from catalog-confirmed dry foods', () => {
    const oats = { ...legacyInventory, id: 'oats', name: 'Rolled oats', emoji: '🥣', location: 'Pantry' as const, expiresIn: 30, expiresOn: '2026-11-24' }
    const result = normalizeLegacyInventory([oats]).items[0]
    expect(result).toMatchObject({ id: 'oats', foodGroup: 'Grains & starches', storageAreaId: 'pantry', freshnessPolicy: 'none', expiresIn: null, expiresOn: null })
  })

  it('uses household mappings before catalog icons and catalog before stored icons', () => {
    const milk: InventoryItem = { ...legacyInventory, id: 'milk', name: 'Milk', emoji: '🌶️', category: 'Other' }
    const mapping: HouseholdFoodMapping = { normalizedName: 'milk', displayName: 'House milk', emoji: '🥤', category: 'Dairy', location: 'Fridge' }
    expect(resolveInventoryPresentation(milk, [mapping])).toMatchObject({ name: 'House milk', emoji: '🥤' })
    expect(resolveInventoryPresentation(milk, [])).toMatchObject({ name: 'Milk', emoji: '🥛' })
    expect(resolveGroceryPresentation({ name: 'Milk', amount: 1, unit: 'item', checked: false }, [])).toMatchObject({ emoji: '🥛' })
    expect(resolveInventoryPresentation({ ...legacyInventory, id: 'harissa' }, [])).toMatchObject({ emoji: '🌶️' })
    expect(resolveGroceryPresentation({ name: 'Mystery food', amount: 1, unit: 'item', checked: false }, [])).toMatchObject({ emoji: '🛒' })
  })

  it('backfills only confirmed, unknown, non-generic legacy icons', () => {
    const additions = legacyFoodMappings([
      { ...legacyInventory, id: 'harissa' },
      { ...legacyInventory, id: 'unknown', name: 'Mystery food', emoji: '🥫' },
      { ...legacyInventory, id: 'milk', name: 'Milk', emoji: '🥛' },
    ], [])
    expect(additions).toEqual([{ normalizedName: 'harissa paste', displayName: 'Harissa paste', emoji: '🌶️', category: 'Pantry', location: 'Fridge' }])
  })
})
