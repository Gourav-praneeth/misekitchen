import { describe, expect, it } from 'vitest'
import { groceryCategory, groceryEmoji, groceryItemFromText, groceryItemsFromText, inventoryItemFromGrocery, mergeGroceryItems, mergeInventoryItems, purchasedGroceryAmount } from './inventoryIntelligence'
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
    expect(result.items[0]).toMatchObject({ id: 'carrots', quantity: 1, unit: 'item', expiresOn: '2026-10-15' })
  })

  it('collapses the same ingredient even when legacy units differ', () => {
    const rice: InventoryItem = { ...carrots, id: 'rice-cups', name: 'Rice', emoji: '🍚', quantity: 2, unit: 'cups', category: 'Pantry', location: 'Pantry' }
    const bag = { ...rice, id: 'rice-bag', quantity: 1, unit: 'bag' }

    expect(mergeInventoryItems([rice], [bag])).toMatchObject({ merged: 1, added: 0, items: [{ quantity: 1, unit: 'item' }] })
  })

  it('recognizes the same barcode and preserves product metadata when merging', () => {
    const current = { ...carrots, id: 'first', name: 'Carrot snack', quantity: 250, unit: 'g', barcode: '4006381333931' }
    const incoming = { ...carrots, id: 'second', name: 'Store carrots', quantity: 250, unit: 'g', barcode: '4006381333931', brand: 'Garden Co' }
    const result = mergeInventoryItems([current], [incoming])
    expect(result).toMatchObject({ merged: 1, added: 0 })
    expect(result.items[0]).toMatchObject({ quantity: 1, unit: 'item', barcode: '4006381333931', brand: 'Garden Co' })
  })

  it('parses a natural grocery entry and supplies its food icon', () => {
    const item = groceryItemFromText('2 bags baby spinach')
    expect(item).toMatchObject({ name: 'Baby Spinach', amount: 2, unit: 'bags' })
    expect(groceryEmoji(item!)).toBe('🥬')
  })

  it('bulk parses a multiline shopping note', () => {
    expect(groceryItemsFromText('2 bags baby spinach\n1 gallon milk\n6 apples')).toMatchObject([
      { name: 'Baby Spinach', amount: 2, unit: 'bags', checked: false },
      { name: 'Milk', amount: 1, unit: 'gallon', checked: false },
      { name: 'Apples', amount: 6, checked: false },
    ])
  })

  it('organizes recognized groceries into shopping sections', () => {
    expect(groceryCategory({ name: 'baby spinach' })).toBe('Produce')
    expect(groceryCategory({ name: 'Greek yogurt' })).toBe('Dairy')
    expect(groceryCategory({ name: 'unknown specialty item' })).toBe('Other')
    expect(groceryCategory({ name: 'Greek yogurt', category: 'Pantry' })).toBe('Pantry')
  })

  it('keeps a user-selected aisle when a grocery item merges', () => {
    const result = mergeGroceryItems(
      [{ name: 'Milk', amount: 1, unit: 'carton', checked: false, category: 'Dairy' }],
      [{ name: 'Milk', amount: 2, unit: 'carton', checked: false, category: 'Pantry' }],
    )
    expect(result[0].category).toBe('Pantry')
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
      name: 'Broccoli', emoji: '🥦', quantity: 1, unit: 'item', category: 'Produce', location: 'Fridge', expiresIn: 6,
    })
  })

  it('transfers the actual package purchase instead of the recipe requirement', () => {
    const almonds = { name: 'Almonds', amount: 6, unit: 'almonds', checked: true, purchase: { packageCount: 2, packageSize: 500, packageUnit: 'g', location: 'Fridge' as const, expiresOn: '2026-11-01', barcode: '4006381333931', brand: 'Market Nuts', productSource: 'open-food-facts' as const } }
    expect(purchasedGroceryAmount(almonds)).toEqual({ amount: 1000, unit: 'g' })
    expect(inventoryItemFromGrocery(almonds, 'almonds-1')).toMatchObject({ quantity: 1, unit: 'item', location: 'Fridge', expiresOn: null, freshnessPolicy: 'none', barcode: '4006381333931', brand: 'Market Nuts' })
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
