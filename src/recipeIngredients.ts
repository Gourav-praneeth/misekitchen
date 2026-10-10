import { parseSmartEntry, sameFoodAndUnit } from './smartEntry'
import type { RecipeIngredient } from './types'

export function parseRecipeIngredients(input: string): RecipeIngredient[] {
  return parseSmartEntry(input).map((item) => ({
    name: item.name,
    amount: item.quantity,
    unit: item.unit,
  }))
}

export function mergeRecipeIngredients(current: RecipeIngredient[], incoming: RecipeIngredient[]): RecipeIngredient[] {
  const merged = current.filter((ingredient) => ingredient.name.trim())

  incoming.forEach((ingredient) => {
    const match = merged.find((candidate) => sameFoodAndUnit(candidate, ingredient))
    if (match) match.amount = Number((match.amount + ingredient.amount).toFixed(2))
    else merged.push({ ...ingredient })
  })

  return merged.length ? merged : current
}
