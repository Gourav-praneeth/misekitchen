import { describe, expect, it } from 'vitest'
import { preferenceWarnings } from './foodPreferences'
import type { Recipe } from './types'

const recipe: Recipe = {
  id: 'pasta', name: 'Creamy chicken pasta', description: '', time: 20, servings: 2,
  protein: 20, accent: '#fff', emoji: '🍝', ingredients: [
    { name: 'Chicken breast', amount: 1, unit: 'lb' },
    { name: 'Heavy cream', amount: 1, unit: 'cup' },
    { name: 'Wheat pasta', amount: 2, unit: 'cups' },
  ],
}

describe('preferenceWarnings', () => {
  it('flags obvious dietary and intolerance conflicts in saved recipes', () => {
    expect(preferenceWarnings(recipe, { diet: 'Vegetarian', intolerances: ['Dairy', 'Wheat'], excludedIngredients: [] }))
      .toEqual(['May contain dairy', 'May contain wheat', 'May not be vegetarian'])
  })

  it('flags ingredients a user explicitly excludes', () => {
    expect(preferenceWarnings(recipe, { diet: '', intolerances: [], excludedIngredients: ['chicken'] }))
      .toEqual(['Contains chicken'])
  })
})
