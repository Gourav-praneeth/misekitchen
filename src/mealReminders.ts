import type { MealPlanEntry, MealSlot, Recipe } from './types'
import { localDateKey } from './mealPlanner'

export type MealReminderPreferences = {
  enabled: boolean
  leadMinutes: number
  times: Record<MealSlot, string>
}

export type MealReminder = {
  entry: MealPlanEntry
  recipe: Recipe
  scheduledAt: Date
  minutesUntil: number
  due: boolean
}

export const defaultMealReminderPreferences: MealReminderPreferences = {
  enabled: false,
  leadMinutes: 60,
  times: { breakfast: '08:00', lunch: '12:30', snack: '15:30', dinner: '18:30' },
}

export function normalizeMealReminderPreferences(value: unknown): MealReminderPreferences {
  if (!value || typeof value !== 'object') return defaultMealReminderPreferences
  const input = value as Partial<MealReminderPreferences>
  const times = input.times || defaultMealReminderPreferences.times
  return {
    enabled: Boolean(input.enabled),
    leadMinutes: [30, 60, 120].includes(Number(input.leadMinutes)) ? Number(input.leadMinutes) : 60,
    times: {
      breakfast: validTime(times.breakfast) ? times.breakfast : defaultMealReminderPreferences.times.breakfast,
      lunch: validTime(times.lunch) ? times.lunch : defaultMealReminderPreferences.times.lunch,
      snack: validTime(times.snack) ? times.snack : defaultMealReminderPreferences.times.snack,
      dinner: validTime(times.dinner) ? times.dinner : defaultMealReminderPreferences.times.dinner,
    },
  }
}

export function mealRemindersForToday(
  entries: MealPlanEntry[],
  recipes: Recipe[],
  now: Date,
  preferences: MealReminderPreferences,
): MealReminder[] {
  if (!preferences.enabled) return []
  const today = localDateKey(now)
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]))
  return entries.flatMap((entry) => {
    if (entry.date !== today) return []
    const recipe = recipesById.get(entry.recipeId)
    if (!recipe) return []
    const scheduledAt = dateAtTime(now, preferences.times[entry.mealSlot])
    const minutesUntil = Math.round((scheduledAt.getTime() - now.getTime()) / 60000)
    return [{ entry, recipe, scheduledAt, minutesUntil, due: minutesUntil <= preferences.leadMinutes && minutesUntil >= -60 }]
  }).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
}

export function mealReminderLabel(reminder: MealReminder) {
  const minutes = reminder.minutesUntil
  if (minutes < -60) return 'Earlier today'
  if (minutes < 0) return `${Math.abs(minutes)} min ago`
  if (minutes === 0) return 'Now'
  if (minutes < 60) return `In ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `In ${hours}h ${remainder}m` : `In ${hours}h`
}

function dateAtTime(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes)
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}
