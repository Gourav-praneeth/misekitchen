import { daysUntilExpiration } from './freshness'
import { normalizeFoodName } from './smartEntry'
import { preferenceWarnings } from './foodPreferences'
import { availableAmount } from './measurements'
import type { FoodPreferences, GroceryItem, InventoryItem, Recipe } from './types'

export type RecipeMatch = Recipe & {
  available: number
  missing: GroceryItem[]
  urgent: number
  score: number
  preferenceWarnings: string[]
}

export function matchRecipes(recipeList: Recipe[], inventory: InventoryItem[], preferences?: FoodPreferences): RecipeMatch[] {
  return recipeList.map((recipe) => {
    const statuses = recipe.ingredients.map((ingredient) => {
      const matchingItems = inventory.filter((entry) => normalizeFoodName(entry.name) === normalizeFoodName(ingredient.name))
      const have = availableAmount(matchingItems, ingredient, normalizeFoodName)
      return { ingredient, item: matchingItems[0], have, enough: have + 0.0005 >= ingredient.amount }
    })
    const missing = statuses.flatMap(({ ingredient, have, enough }) => enough ? [] : [{
      ...ingredient,
      amount: Number(Math.max(ingredient.amount - have, 0).toFixed(2)),
      checked: false,
    }])
    const urgent = statuses.filter(({ item, have }) => {
      if (!item || have <= 0) return false
      const days = daysUntilExpiration(item)
      return days !== null && days <= 3
    }).length
    const available = recipe.ingredients.length
      ? Math.round(((recipe.ingredients.length - missing.length) / recipe.ingredients.length) * 100)
      : 0
    return { ...recipe, missing, available, urgent, score: available + urgent * 8, preferenceWarnings: preferences ? preferenceWarnings(recipe, preferences) : [] }
  }).sort((a, b) => b.score - a.score || a.time - b.time)
}
