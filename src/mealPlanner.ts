import { normalizeFoodName } from './smartEntry'
import type { GroceryItem, InventoryItem, MealPlanEntry, Recipe } from './types'
import { availableAmount, convertAmount } from './measurements'

export function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function startOfWeek(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = start.getDay()
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1))
  return start
}

export function weekDates(start: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

export function addWeeks(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount * 7)
  return next
}

export function groceryForMealPlan(entries: MealPlanEntry[], recipes: Recipe[], inventory: InventoryItem[]): GroceryItem[] {
  const needs: Array<{ name: string; unit: string; amount: number }> = []
  entries.forEach((entry) => {
    const recipe = recipes.find((candidate) => candidate.id === entry.recipeId)
    if (!recipe) return
    const scale = entry.servings / recipe.servings
    recipe.ingredients.forEach((ingredient) => {
      const amount = ingredient.amount * scale
      const current = needs.find((need) => normalizeFoodName(need.name) === normalizeFoodName(ingredient.name) && convertAmount(amount, ingredient.unit, need.unit) !== null)
      if (current) current.amount += convertAmount(amount, ingredient.unit, current.unit) || 0
      else needs.push({ name: ingredient.name, unit: ingredient.unit, amount })
    })
  })

  return needs.flatMap((needed) => {
    const available = availableAmount(inventory, needed, normalizeFoodName)
    const amount = Number(Math.max(needed.amount - available, 0).toFixed(1))
    return amount > 0 ? [{ name: needed.name, unit: needed.unit, amount, checked: false }] : []
  })
}
