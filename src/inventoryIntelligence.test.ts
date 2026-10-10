import { describe, expect, it } from 'vitest'
import { groceryEmoji, groceryItemFromText, inventoryItemFromGrocery, mergeGroceryItems, mergeInventoryItems } from './inventoryIntelligence'
import { recipes } from './data'
import { matchRecipes } from './recipeIntelligence'
import type { InventoryItem } from './types'

const carrots: InventoryItem = {
  id: 'carrots', name: 'Carrots', emoji: '🥕', quantity: 3, unit: 'whole', category: 'Produce', location: 'Fridge', expiresIn: 10, expiresOn: '2026-10-20',
}

describe('duplicate-safe inventory intelligence', () => {
  it('merges catalog-equivalent foods and infers generic units', () => {
    const incoming = { ...carrots, id: 'more-carrots', name: 'carrot', quantity: 2, unit: 'item', expiresIn: 5, expiresOn: '2026-10-15' }
    const result = mergeInventoryItems([carrots], [incoming])

    expect(result).toMatchObject({ merged: 1, added: 0 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ id: 'carrots', quantity: 5, unit: 'whole', expiresOn: '2026-10-15' })
  })

  it('keeps incompatible quantities separate', () => {
    const rice: InventoryItem = { ...carrots, id: 'rice-cups', name: 'Rice', emoji: '🍚', quantity: 2, unit: 'cups', category: 'Pantry', location: 'Pantry' }
    const bag = { ...rice, id: 'rice-bag', quantity: 1, unit: 'bag' }

    expect(mergeInventoryItems([rice], [bag])).toMatchObject({ merged: 0, added: 1 })
  })

  it('parses a natural grocery entry and supplies its food icon', () => {
    const item = groceryItemFromText('2 bags baby spinach')
    expect(item).toMatchObject({ name: 'Baby Spinach', amount: 2, unit: 'bags' })
    expect(groceryEmoji(item!)).toBe('🥬')
  })

  it('deduplicates grocery entries using catalog identities', () => {
    const result = mergeGroceryItems(
      [{ name: 'Greek yogurt', amount: 1, unit: 'cups', checked: true }],
      [{ name: 'GRK YGT', amount: 3, unit: 'cup', checked: false }],
    )
    expect(result).toEqual([{ name: 'Greek yogurt', amount: 3, unit: 'cups', checked: false }])
  })

  it('converts purchased groceries into intelligent kitchen items', () => {
    expect(inventoryItemFromGrocery({ name: 'broccoli', amount: 2, unit: 'item', checked: true }, 'b1')).toMatchObject({
      name: 'Broccoli', emoji: '🥦', quantity: 2, unit: 'head', category: 'Produce', location: 'Fridge', expiresIn: 6,
    })
  })

  it('gives every default recipe ingredient a specific grocery icon', () => {
    const groceryItems = matchRecipes(recipes, []).flatMap((recipe) => recipe.missing)
    const icons = groceryItems.map((item) => ({ name: item.name, icon: groceryEmoji(item) }))

    expect(icons.filter(({ icon }) => icon === '🛒')).toEqual([])
    expect(icons).toContainEqual({ name: 'Milk', icon: '🥛' })
    expect(icons).toContainEqual({ name: 'Milled flax seeds', icon: '🌾' })
    expect(icons).toContainEqual({ name: 'Cooked shredded chicken', icon: '🍗' })
    expect(icons).toContainEqual({ name: 'Grainy Dijon mustard', icon: '🫙' })
  })
})
