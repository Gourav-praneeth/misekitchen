import { describe, expect, it } from 'vitest'
import { cookingHistoryEntry, cookingHistoryStats, recentCookingHistory } from './cookingHistory'
import type { Recipe } from './types'

const recipe: Recipe = {
  id: 'oats', name: 'Overnight oats', description: '', time: 5, servings: 2,
  protein: 20, accent: '#fff', emoji: '🥣', ingredients: [],
}

describe('cooking history', () => {
  it('records the selected serving scale and recipe snapshot', () => {
    const entry = cookingHistoryEntry(recipe, 1.5, { userId: 'user-1', name: 'Gourav' }, new Date('2026-10-13T18:00:00Z'), 'entry-1')
    expect(entry).toMatchObject({ recipeId: 'oats', recipeName: 'Overnight oats', servings: 3, cookedByName: 'Gourav' })
  })

  it('sorts newest first and limits the result', () => {
    const entries = ['2026-10-10', '2026-10-12', '2026-10-11'].map((date, index) => cookingHistoryEntry(recipe, 1, {}, new Date(`${date}T18:00:00Z`), `entry-${index}`))
    expect(recentCookingHistory(entries, 2).map((entry) => entry.cookedAt.slice(0, 10))).toEqual(['2026-10-12', '2026-10-11'])
  })

  it('summarizes meals and servings from the last 30 days', () => {
    const entries = [
      cookingHistoryEntry(recipe, 1, {}, new Date('2026-10-12T18:00:00Z'), 'recent'),
      cookingHistoryEntry(recipe, 2, {}, new Date('2026-08-01T18:00:00Z'), 'old'),
    ]
    expect(cookingHistoryStats(entries, new Date('2026-10-13T18:00:00Z'))).toEqual({ totalMeals: 2, recentMeals: 1, totalServings: 6 })
  })
})
