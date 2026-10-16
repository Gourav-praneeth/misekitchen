import { describe, expect, it } from 'vitest'
import { matchRecipes, recommendationGuidance } from './recipeIntelligence'
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
  it('treats an ingredient as available by presence and returns the full recipe quantity when absent', () => {
    const [match] = matchRecipes([recipe], inventory.filter((item) => item.name === 'Milk'))
    expect(match.available).toBe(50)
    expect(match.urgent).toBe(0)
    expect(match.missing).toEqual([{ name: 'Carrots', amount: 4, unit: 'whole', checked: false }])
  })

  it('ignores legacy kitchen units when the ingredient is present', () => {
    const [match] = matchRecipes([{ ...recipe, ingredients: [{ name: 'Milk', amount: 1, unit: 'bottle' }] }], inventory)
    expect(match.available).toBe(100)
    expect(match.missing).toEqual([])
  })

  it('matches compatible kitchen units automatically', () => {
    const metricInventory = [{ ...inventory[1], quantity: 1000, unit: 'ml' }]
    const [match] = matchRecipes([{ ...recipe, ingredients: [{ name: 'Milk', amount: 0.5, unit: 'cups' }] }], metricInventory)
    expect(match.available).toBe(100)
    expect(match.missing).toEqual([])
  })

  it('explains recommendations and avoids a recently cooked repeat', () => {
    const now = new Date('2026-10-14T18:00:00')
    const first = { ...recipe, id: 'first', name: 'First soup', ingredients: [{ name: 'Milk', amount: 1, unit: 'cups' }], time: 20 }
    const second = { ...first, id: 'second', name: 'Second soup' }
    const matches = matchRecipes([first, second], inventory, undefined, {
      now,
      cookingHistory: [{ id: 'history', recipeId: 'first', recipeName: first.name, recipeEmoji: first.emoji, servings: 2, timeMinutes: 20, cookedAt: '2026-10-13T18:00:00.000Z', cookedByUserId: null, cookedByName: 'Test' }],
    })
    expect(matches.map((match) => match.id)).toEqual(['second', 'first'])
    expect(matches[0].recommendationReasons).toContain('Ready with what you have')
    expect(matches[0].recommendationReasons).toContain('Ready in 20 minutes')
    expect(matches[1].recommendationReasons).toContain('Cooked 1 day ago')
  })

  it("prioritizes a recipe on today's meal plan", () => {
    const now = new Date('2026-10-14T18:00:00')
    const first = { ...recipe, id: 'first', name: 'First soup', ingredients: [{ name: 'Milk', amount: 1, unit: 'cups' }] }
    const second = { ...first, id: 'second', name: 'Second soup' }
    const matches = matchRecipes([second, first], inventory, undefined, {
      now,
      mealPlan: [{ id: 'dinner', date: '2026-10-14', recipeId: 'first', servings: 2, mealSlot: 'dinner' }],
    })
    expect(matches[0].id).toBe('first')
    expect(matches[0].planned).toBe('today')
    expect(matches[0].recommendationReasons[0]).toBe("On today's meal plan")
  })

  it('explains which ingredients would unlock a weak top match', () => {
    const partialInventory = [{ ...inventory[0], quantity: 4 }]
    const weakRecipe = { ...recipe, ingredients: [...recipe.ingredients, { name: 'Eggs', amount: 2, unit: 'whole' }] }
    const matches = matchRecipes([weakRecipe], partialInventory)
    const guidance = recommendationGuidance(matches, partialInventory)
    expect(guidance?.kind).toBe('low-match')
    expect(guidance?.message).toContain('Milk')
    expect(guidance?.unlockItems).toContainEqual({ name: 'Milk', amount: 2, unit: 'cups', checked: false })
  })

  it('does not interrupt useful matches with low-match guidance', () => {
    const matches = matchRecipes([recipe], inventory)
    expect(recommendationGuidance(matches, inventory)).toBeNull()
  })

  it('guides an empty recipe collection', () => {
    expect(recommendationGuidance([], inventory)).toMatchObject({ kind: 'empty', unlockItems: [] })
  })
})
