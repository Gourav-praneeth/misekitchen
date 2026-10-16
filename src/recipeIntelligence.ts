import { daysUntilExpiration } from './freshness'
import { normalizeFoodName } from './smartEntry'
import { preferenceWarnings } from './foodPreferences'
import { hasIngredient } from './inventoryPresence'
import type { CookingHistoryEntry, FoodPreferences, GroceryItem, InventoryItem, MealPlanEntry, Recipe } from './types'

export type RecommendationContext = {
  cookingHistory?: CookingHistoryEntry[]
  mealPlan?: MealPlanEntry[]
  now?: Date
}

export type RecipeMatch = Recipe & {
  available: number
  missing: GroceryItem[]
  urgent: number
  score: number
  preferenceWarnings: string[]
  recommendationReasons: string[]
  planned: 'today' | 'upcoming' | null
  recentlyCookedDays: number | null
}

export type RecommendationGuidance = {
  kind: 'empty' | 'low-match'
  title: string
  message: string
  unlockItems: GroceryItem[]
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysSince(isoDate: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(isoDate).getTime()) / 86_400_000))
}

export function matchRecipes(recipeList: Recipe[], inventory: InventoryItem[], preferences?: FoodPreferences, context: RecommendationContext = {}): RecipeMatch[] {
  const now = context.now || new Date()
  const today = dateKey(now)
  const upcomingLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
  const upcomingDate = dateKey(upcomingLimit)
  return recipeList.map((recipe) => {
    const statuses = recipe.ingredients.map((ingredient) => {
      const matchingItems = inventory.filter((entry) => normalizeFoodName(entry.name) === normalizeFoodName(ingredient.name))
      return { ingredient, item: matchingItems[0], enough: hasIngredient(inventory, ingredient) }
    })
    const missing = statuses.flatMap(({ ingredient, enough }) => enough ? [] : [{
      ...ingredient,
      amount: Number(ingredient.amount.toFixed(2)),
      checked: false,
    }])
    const urgent = statuses.filter(({ item }) => {
      if (!item) return false
      const days = daysUntilExpiration(item)
      return days !== null && days <= 3
    }).length
    const available = recipe.ingredients.length
      ? Math.round(((recipe.ingredients.length - missing.length) / recipe.ingredients.length) * 100)
      : 0
    const warnings = preferences ? preferenceWarnings(recipe, preferences) : []
    const plannedEntries = (context.mealPlan || []).filter((entry) => entry.recipeId === recipe.id && entry.date >= today && entry.date <= upcomingDate)
    const planned: RecipeMatch['planned'] = plannedEntries.some((entry) => entry.date === today) ? 'today' : plannedEntries.length ? 'upcoming' : null
    const lastCooked = (context.cookingHistory || [])
      .filter((entry) => entry.recipeId === recipe.id)
      .sort((left, right) => new Date(right.cookedAt).getTime() - new Date(left.cookedAt).getTime())[0]
    const recentlyCookedDays = lastCooked ? daysSince(lastCooked.cookedAt, now) : null
    const recentPenalty = recentlyCookedDays === null ? 0 : recentlyCookedDays <= 3 ? 28 : recentlyCookedDays <= 7 ? 18 : recentlyCookedDays <= 14 ? 8 : 0
    const timeScore = recipe.time <= 20 ? 8 : recipe.time <= 30 ? 4 : recipe.time >= 60 ? -4 : 0
    const readyScore = missing.length === 0 ? 14 : 0
    const planScore = planned === 'today' ? 20 : planned === 'upcoming' ? 7 : 0
    const score = available + Math.min(urgent, 3) * 12 + readyScore + timeScore + planScore - recentPenalty - warnings.length * 80
    const recommendationReasons: string[] = []
    if (planned === 'today') recommendationReasons.push("On today's meal plan")
    else if (planned === 'upcoming') recommendationReasons.push('Planned in the next 7 days')
    if (urgent > 0) recommendationReasons.push(`Uses ${urgent} ingredient${urgent === 1 ? '' : 's'} expiring soon`)
    if (missing.length === 0) recommendationReasons.push('Ready with what you have')
    else if (missing.length <= 2) recommendationReasons.push(`Only ${missing.length} grocery item${missing.length === 1 ? '' : 's'} needed`)
    else recommendationReasons.push(`${available}% of ingredients ready`)
    if (recipe.time <= 20) recommendationReasons.push(`Ready in ${recipe.time} minutes`)
    if (recentlyCookedDays !== null && recentlyCookedDays <= 14) recommendationReasons.push(`Cooked ${recentlyCookedDays === 0 ? 'today' : `${recentlyCookedDays} day${recentlyCookedDays === 1 ? '' : 's'} ago`}`)
    return { ...recipe, missing, available, urgent, score, preferenceWarnings: warnings, recommendationReasons, planned, recentlyCookedDays }
  }).sort((a, b) => b.score - a.score || a.time - b.time)
}

export function recommendationGuidance(matches: RecipeMatch[], inventory: InventoryItem[]): RecommendationGuidance | null {
  if (!matches.length) return {
    kind: 'empty',
    title: 'Build your recipe collection',
    message: 'Add your own recipe or discover one to start getting kitchen-aware suggestions.',
    unlockItems: [],
  }

  const best = matches[0]
  if (best.missing.length === 0 || best.available >= 50) return null
  if (!inventory.length) return {
    kind: 'low-match',
    title: 'Tell Mise what is in your kitchen',
    message: `Add a few ingredients to see how close you are to making ${best.name}.`,
    unlockItems: best.missing.slice(0, 3),
  }

  const unlockItems = best.missing.slice(0, 3)
  const names = unlockItems.map((item) => item.name)
  const itemList = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  return {
    kind: 'low-match',
    title: 'A few ingredients unlock a better match',
    message: `${itemList} would move ${best.name} beyond its current ${best.available}% kitchen match.`,
    unlockItems,
  }
}
