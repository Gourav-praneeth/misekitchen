import { describe, expect, it } from 'vitest'
import { mergeRecipeIngredients, parseRecipeIngredients } from './recipeIngredients'

describe('recipe ingredient quick add', () => {
  it('parses common recipe quantities and units in bulk', () => {
    expect(parseRecipeIngredients('2 cups rice\n1 tbsp olive oil\n3 cloves garlic')).toEqual([
      { name: 'Rice', amount: 2, unit: 'cups' },
      { name: 'Olive Oil', amount: 1, unit: 'tbsp' },
      { name: 'Garlic', amount: 3, unit: 'cloves' },
    ])
  })

  it('replaces an empty starter row and combines matching ingredients', () => {
    const result = mergeRecipeIngredients(
      [{ name: '', amount: 1, unit: 'item' }, { name: 'Rice', amount: 1, unit: 'cup' }],
      [{ name: 'Rice', amount: 2, unit: 'cups' }, { name: 'Spinach', amount: 1, unit: 'bag' }],
    )

    expect(result).toEqual([
      { name: 'Rice', amount: 3, unit: 'cup' },
      { name: 'Spinach', amount: 1, unit: 'bag' },
    ])
  })
})
