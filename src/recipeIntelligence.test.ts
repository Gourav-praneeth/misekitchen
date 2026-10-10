import { describe, expect, it } from 'vitest'
import { matchRecipes } from './recipeIntelligence'
import type { InventoryItem, Recipe } from './types'

const recipe: Recipe = {
  id: 'soup', name: 'Carrot soup', description: '', time: 25, servings: 2, protein: 4,
  accent: '#d8905d', emoji: '🥕', source: 'user',
  ingredients: [{ name: 'Carrots', amount: 4, unit: 'whole' }, { name: 'Milk', amount: 2, unit: 'cups' }],
}

const inventory: InventoryItem[] = [
  { id: 'carrots', name: 'carrot', emoji: '🥕', quantity: 2, unit: 'whole', category: 'Produce', location: 'Fridge', expiresIn: 1 },
  { id: 'milk', name: 'Milk', emoji: '🥛', quantity: 2, unit: 'cups', category: 'Dairy', location: 'Fridge', expiresIn: 7 },
]

describe('matchRecipes', () => {
  it('ranks recipes and returns only the quantity still missing', () => {
    const [match] = matchRecipes([recipe], inventory)
    expect(match.available).toBe(50)
    expect(match.urgent).toBe(1)
    expect(match.missing).toEqual([{ name: 'Carrots', amount: 2, unit: 'whole', checked: false }])
  })

  it('does not treat incompatible units as interchangeable', () => {
    const [match] = matchRecipes([{ ...recipe, ingredients: [{ name: 'Milk', amount: 1, unit: 'bottle' }] }], inventory)
    expect(match.available).toBe(0)
    expect(match.missing[0].amount).toBe(1)
  })
})
