import { normalizeFoodName } from './smartEntry'
import type { GroceryItem, InventoryItem, MealPlanEntry, Recipe } from './types'

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

const unitKey = (unit: string) => unit.trim().toLowerCase().replace(/s$/, '')

export function groceryForMealPlan(entries: MealPlanEntry[], recipes: Recipe[], inventory: InventoryItem[]): GroceryItem[] {
  const needs = new Map<string, { name: string; unit: string; amount: number }>()
  entries.forEach((entry) => {
    const recipe = recipes.find((candidate) => candidate.id === entry.recipeId)
    if (!recipe) return
    const scale = entry.servings / recipe.servings
    recipe.ingredients.forEach((ingredient) => {
      const key = `${normalizeFoodName(ingredient.name)}|${unitKey(ingredient.unit)}`
      const current = needs.get(key)
      const amount = ingredient.amount * scale
      needs.set(key, { name: current?.name || ingredient.name, unit: current?.unit || ingredient.unit, amount: (current?.amount || 0) + amount })
    })
  })

  return [...needs.entries()].flatMap(([key, needed]) => {
    const [name, unit] = key.split('|')
    const available = inventory
      .filter((item) => normalizeFoodName(item.name) === name && unitKey(item.unit) === unit)
      .reduce((total, item) => total + item.quantity, 0)
    const amount = Number(Math.max(needed.amount - available, 0).toFixed(2))
    return amount > 0 ? [{ name: needed.name, unit: needed.unit, amount, checked: false }] : []
  })
}
