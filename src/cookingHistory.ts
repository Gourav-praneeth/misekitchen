import type { CookingHistoryEntry, Recipe } from './types'

export function cookingHistoryEntry(
  recipe: Recipe,
  scale: number,
  actor: { userId?: string | null; name?: string } = {},
  cookedAt = new Date(),
  id = `cooked-${crypto.randomUUID()}`,
): CookingHistoryEntry {
  return {
    id,
    recipeId: recipe.id,
    recipeName: recipe.name,
    recipeEmoji: recipe.emoji,
    servings: Math.max(1, Math.round(recipe.servings * scale)),
    timeMinutes: recipe.time,
    cookedAt: cookedAt.toISOString(),
    cookedByUserId: actor.userId || null,
    cookedByName: actor.name?.trim() || 'You',
  }
}

export function recentCookingHistory(entries: CookingHistoryEntry[], limit = 40) {
  return [...entries]
    .sort((a, b) => new Date(b.cookedAt).getTime() - new Date(a.cookedAt).getTime())
    .slice(0, limit)
}

export function cookingHistoryStats(entries: CookingHistoryEntry[], now = new Date()) {
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  return {
    totalMeals: entries.length,
    recentMeals: entries.filter((entry) => new Date(entry.cookedAt) >= thirtyDaysAgo).length,
    totalServings: entries.reduce((sum, entry) => sum + entry.servings, 0),
  }
}
