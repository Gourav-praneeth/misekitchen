import type { DiscoverRecipe, DiscoverRecipeDetails } from './spoonacular'
import type { Recipe } from './types'

export function discoveredRecipeId(id: number) {
  return `spoonacular-${id}`
}

export function saveableDiscoveredRecipe(preview: DiscoverRecipe, details: DiscoverRecipeDetails): Recipe {
  return {
    id: discoveredRecipeId(preview.id),
    name: details.title || preview.title,
    description: `Saved from ${details.sourceName || 'Spoonacular'}.`,
    time: Math.max(1, details.readyInMinutes || 20),
    servings: Math.max(1, details.servings || 1),
    protein: 0,
    accent: '#78927a',
    emoji: '🍽️',
    ingredients: details.ingredients.map((ingredient) => ({
      name: ingredient.name,
      amount: ingredient.amount || 1,
      unit: ingredient.unit || 'item',
    })),
    instructions: details.instructions,
    source: 'spoonacular',
    externalId: preview.id,
    sourceUrl: details.sourceUrl,
    imageUrl: details.image || preview.image,
  }
}
