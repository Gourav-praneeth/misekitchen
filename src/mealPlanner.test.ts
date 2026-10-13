import { describe, expect, it } from 'vitest'
import { copyMealPlanDay, groceryForMealPlan, localDateKey, repeatMealPlanWeek, startOfWeek, weekDates } from './mealPlanner'
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

  it('subtracts inventory stored in a compatible measurement unit', () => {
    const milkRecipe: Recipe = { ...recipe, id: 'oats', ingredients: [{ name: 'Milk', amount: 0.5, unit: 'cups' }] }
    const entries: MealPlanEntry[] = [{ id: 'oats', date: '2026-10-05', recipeId: 'oats', servings: 2, mealSlot: 'dinner' }]
    const metricMilk: InventoryItem[] = [{ id: 'milk', name: 'Milk', emoji: '🥛', quantity: 100, unit: 'ml', category: 'Dairy', location: 'Fridge', expiresIn: 4 }]
    expect(groceryForMealPlan(entries, [milkRecipe], metricMilk)).toEqual([{ name: 'Milk', amount: 0.08, unit: 'cups', checked: false }])
  })

  it('copies every meal slot to another day and replaces that day', () => {
    const entries: MealPlanEntry[] = [
      { id: 'breakfast-mon', date: '2026-10-05', recipeId: 'oats', servings: 1, mealSlot: 'breakfast' },
      { id: 'dinner-mon', date: '2026-10-05', recipeId: 'tacos', servings: 2, mealSlot: 'dinner' },
      { id: 'snack-tue', date: '2026-10-06', recipeId: 'fruit', servings: 1, mealSlot: 'snack' },
    ]
    expect(copyMealPlanDay(entries, '2026-10-05', '2026-10-06')).toEqual([
      entries[0], entries[1],
      { id: 'breakfast-2026-10-06', date: '2026-10-06', recipeId: 'oats', servings: 1, mealSlot: 'breakfast' },
      { id: 'dinner-2026-10-06', date: '2026-10-06', recipeId: 'tacos', servings: 2, mealSlot: 'dinner' },
    ])
  })

  it('repeats all meal slots into the following week', () => {
    const entries: MealPlanEntry[] = [
      { id: 'breakfast-2026-10-05', date: '2026-10-05', recipeId: 'oats', servings: 1, mealSlot: 'breakfast' },
      { id: 'lunch-2026-10-07', date: '2026-10-07', recipeId: 'salad', servings: 2, mealSlot: 'lunch' },
      { id: 'old-next-week', date: '2026-10-12', recipeId: 'old', servings: 4, mealSlot: 'dinner' },
    ]
    expect(repeatMealPlanWeek(entries, new Date(2026, 9, 5))).toEqual([
      entries[0], entries[1],
      { id: 'breakfast-2026-10-12', date: '2026-10-12', recipeId: 'oats', servings: 1, mealSlot: 'breakfast' },
      { id: 'lunch-2026-10-14', date: '2026-10-14', recipeId: 'salad', servings: 2, mealSlot: 'lunch' },
    ])
  })
})
