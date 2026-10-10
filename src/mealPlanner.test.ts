import { describe, expect, it } from 'vitest'
import { groceryForMealPlan, localDateKey, startOfWeek, weekDates } from './mealPlanner'
import type { InventoryItem, MealPlanEntry, Recipe } from './types'

const recipe: Recipe = {
  id: 'tacos', name: 'Tacos', description: '', time: 20, servings: 2, protein: 20,
  accent: '#fff', emoji: '🌮', ingredients: [
    { name: 'Chicken breast', amount: 1, unit: 'lb' },
    { name: 'Tortillas', amount: 4, unit: 'whole' },
  ],
}
const inventory: InventoryItem[] = [
  { id: 'chicken', name: 'Chicken breast', emoji: '🍗', quantity: 1, unit: 'lb', category: 'Protein', location: 'Fridge', expiresIn: 2 },
]

describe('weekly meal planning', () => {
  it('creates a Monday-through-Sunday week', () => {
    const dates = weekDates(startOfWeek(new Date(2026, 9, 9)))
    expect(dates.map(localDateKey)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
  })

  it('combines planned quantities before subtracting kitchen inventory', () => {
    const entries: MealPlanEntry[] = [
      { id: 'one', date: '2026-10-05', recipeId: 'tacos', servings: 2, mealSlot: 'dinner' },
      { id: 'two', date: '2026-10-06', recipeId: 'tacos', servings: 4, mealSlot: 'dinner' },
    ]
    expect(groceryForMealPlan(entries, [recipe], inventory)).toEqual([
      { name: 'Chicken breast', amount: 2, unit: 'lb', checked: false },
      { name: 'Tortillas', amount: 12, unit: 'whole', checked: false },
    ])
  })
})
