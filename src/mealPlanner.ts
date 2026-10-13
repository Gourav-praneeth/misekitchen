import { normalizeFoodName } from './smartEntry'
import type { GroceryItem, InventoryItem, MealPlanEntry, MealSlot, Recipe } from './types'
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

export const mealSlots: Array<{ value: MealSlot; label: string; emoji: string }> = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🍳' },
  { value: 'lunch', label: 'Lunch', emoji: '🥗' },
  { value: 'dinner', label: 'Dinner', emoji: '🍽️' },
  { value: 'snack', label: 'Snack', emoji: '🍎' },
]

export function mealPlanEntryId(date: string, mealSlot: MealSlot) {
  return `${mealSlot}-${date}`
}

export function copyMealPlanDay(entries: MealPlanEntry[], sourceDate: string, targetDate: string) {
  const source = entries.filter((entry) => entry.date === sourceDate)
  if (!source.length || sourceDate === targetDate) return entries
  return [
    ...entries.filter((entry) => entry.date !== targetDate),
    ...source.map((entry) => ({ ...entry, id: mealPlanEntryId(targetDate, entry.mealSlot), date: targetDate })),
  ]
}

export function repeatMealPlanWeek(entries: MealPlanEntry[], sourceWeekStart: Date) {
  const sourceDates = weekDates(sourceWeekStart).map(localDateKey)
  const targetDates = weekDates(addWeeks(sourceWeekStart, 1)).map(localDateKey)
  const source = entries.filter((entry) => sourceDates.includes(entry.date))
  const copied = source.map((entry) => {
    const targetDate = targetDates[sourceDates.indexOf(entry.date)]
    return { ...entry, id: mealPlanEntryId(targetDate, entry.mealSlot), date: targetDate }
  })
  return [...entries.filter((entry) => !targetDates.includes(entry.date)), ...copied]
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
    const amount = Number(Math.max(needed.amount - available, 0).toFixed(2))
    return amount > 0 ? [{ name: needed.name, unit: needed.unit, amount, checked: false }] : []
  })
}
