import { describe, expect, it } from 'vitest'
import { defaultMealReminderPreferences, mealReminderLabel, mealRemindersForToday, normalizeMealReminderPreferences } from './mealReminders'
import type { MealPlanEntry, Recipe } from './types'

const recipes: Recipe[] = [
  { id: 'oats', name: 'Overnight oats', description: '', time: 5, servings: 1, protein: 20, accent: '#fff', emoji: '🥣', ingredients: [] },
  { id: 'salad', name: 'Chicken salad', description: '', time: 30, servings: 4, protein: 30, accent: '#fff', emoji: '🥗', ingredients: [] },
]

const entries: MealPlanEntry[] = [
  { id: 'dinner', date: '2026-10-13', recipeId: 'salad', servings: 2, mealSlot: 'dinner' },
  { id: 'breakfast', date: '2026-10-13', recipeId: 'oats', servings: 1, mealSlot: 'breakfast' },
  { id: 'tomorrow', date: '2026-10-14', recipeId: 'oats', servings: 1, mealSlot: 'breakfast' },
]

describe('meal reminders', () => {
  it('returns today’s meals in scheduled order and marks the reminder window', () => {
    const reminders = mealRemindersForToday(entries, recipes, new Date(2026, 9, 13, 17, 45), { ...defaultMealReminderPreferences, enabled: true })
    expect(reminders.map((reminder) => reminder.recipe.name)).toEqual(['Overnight oats', 'Chicken salad'])
    expect(reminders[0].due).toBe(false)
    expect(reminders[1].due).toBe(true)
    expect(mealReminderLabel(reminders[1])).toBe('In 45 min')
  })

  it('is inactive when reminders are disabled', () => {
    expect(mealRemindersForToday(entries, recipes, new Date(2026, 9, 13, 7, 30), defaultMealReminderPreferences)).toEqual([])
  })

  it('repairs incomplete stored preferences', () => {
    expect(normalizeMealReminderPreferences({ enabled: true, leadMinutes: 15, times: { breakfast: 'bad' } })).toEqual({
      enabled: true,
      leadMinutes: 60,
      times: defaultMealReminderPreferences.times,
    })
  })
})
