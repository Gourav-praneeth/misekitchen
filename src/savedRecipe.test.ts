import { describe, expect, it } from 'vitest'
import { discoveredRecipeId, saveableDiscoveredRecipe } from './savedRecipe'

describe('saveableDiscoveredRecipe', () => {
  it('converts Spoonacular details into a persistent Mise recipe', () => {
    const recipe = saveableDiscoveredRecipe({
      id: 42, title: 'Soup', image: 'https://img.example/soup.jpg', usedIngredientCount: 1,
      missedIngredientCount: 1, usedIngredients: [], missedIngredients: [],
    }, {
      id: 42, title: 'Carrot Soup', image: 'https://img.example/soup.jpg', readyInMinutes: 30,
      servings: 4, sourceUrl: 'https://recipes.example/soup', sourceName: 'Recipe House',
      ingredients: [{ name: 'Carrots', amount: 4, unit: 'whole' }], instructions: ['Cook'], diets: [],
    })

    expect(discoveredRecipeId(42)).toBe('spoonacular-42')
    expect(recipe).toMatchObject({
      id: 'spoonacular-42', name: 'Carrot Soup', source: 'spoonacular', externalId: 42,
      time: 30, servings: 4, sourceUrl: 'https://recipes.example/soup',
    })
    expect(recipe.ingredients).toEqual([{ name: 'Carrots', amount: 4, unit: 'whole' }])
  })
})
