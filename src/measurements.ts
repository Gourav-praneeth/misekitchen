import type { InventoryItem, RecipeIngredient } from './types'

type UnitDefinition = { canonical: string; dimension: 'volume' | 'mass' | 'count'; factor: number }

const definitions: Record<string, UnitDefinition> = {}

function define(aliases: string[], canonical: string, dimension: UnitDefinition['dimension'], factor: number) {
  aliases.forEach((alias) => { definitions[alias] = { canonical, dimension, factor } })
}

define(['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'], 'ml', 'volume', 1)
define(['l', 'liter', 'liters', 'litre', 'litres'], 'L', 'volume', 1000)
define(['tsp', 'teaspoon', 'teaspoons'], 'tsp', 'volume', 4.92892)
define(['tbsp', 'tablespoon', 'tablespoons'], 'tbsp', 'volume', 14.7868)
define(['cup', 'cups'], 'cups', 'volume', 236.588)
define(['fl oz', 'fluid ounce', 'fluid ounces'], 'fl oz', 'volume', 29.5735)
define(['pint', 'pints'], 'pint', 'volume', 473.176)
define(['quart', 'quarts'], 'quart', 'volume', 946.353)
define(['gallon', 'gallons'], 'gallon', 'volume', 3785.41)

define(['mg', 'milligram', 'milligrams'], 'mg', 'mass', 0.001)
define(['g', 'gram', 'grams'], 'g', 'mass', 1)
define(['kg', 'kilogram', 'kilograms'], 'kg', 'mass', 1000)
define(['oz', 'ounce', 'ounces'], 'oz', 'mass', 28.3495)
define(['lb', 'lbs', 'pound', 'pounds'], 'lb', 'mass', 453.592)

define([
  'item', 'items', 'piece', 'pieces', 'whole', 'each', 'count',
  'egg', 'eggs', 'almond', 'almonds', 'pecan', 'pecans', 'walnut', 'walnuts',
  'clove', 'cloves', 'stalk', 'stalks', 'sprig', 'sprigs',
], 'items', 'count', 1)

export function unitDefinition(unit: string) {
  return definitions[unit.trim().toLowerCase()] || null
}

export function normalizeMeasurementUnit(unit: string) {
  return unitDefinition(unit)?.canonical || unit.trim().toLowerCase().replace(/s$/, '')
}

export function convertAmount(amount: number, fromUnit: string, toUnit: string): number | null {
  const from = unitDefinition(fromUnit)
  const to = unitDefinition(toUnit)
  if (from && to) return from.dimension === to.dimension ? amount * from.factor / to.factor : null
  return normalizeMeasurementUnit(fromUnit) === normalizeMeasurementUnit(toUnit) ? amount : null
}

export function availableAmount(inventory: InventoryItem[], ingredient: Pick<RecipeIngredient, 'name' | 'unit'>, normalizeName: (name: string) => string) {
  return inventory.reduce((total, item) => {
    if (normalizeName(item.name) !== normalizeName(ingredient.name)) return total
    return total + (convertAmount(item.quantity, item.unit, ingredient.unit) ?? 0)
  }, 0)
}

export function deductIngredients(
  inventory: InventoryItem[],
  ingredients: RecipeIngredient[],
  scale: number,
  normalizeName: (name: string) => string,
) {
  const next = inventory.map((item) => ({ ...item }))
  ingredients.forEach((ingredient) => {
    let remaining = ingredient.amount * scale
    next.forEach((item) => {
      if (remaining <= 0 || normalizeName(item.name) !== normalizeName(ingredient.name)) return
      const availableInRecipeUnit = convertAmount(item.quantity, item.unit, ingredient.unit)
      if (availableInRecipeUnit === null) return
      const usedInRecipeUnit = Math.min(remaining, availableInRecipeUnit)
      const usedInInventoryUnit = convertAmount(usedInRecipeUnit, ingredient.unit, item.unit) || 0
      item.quantity = Math.max(0, Number((item.quantity - usedInInventoryUnit).toFixed(2)))
      remaining -= usedInRecipeUnit
    })
  })
  return next.filter((item) => item.quantity > 0.0005)
}

export function formatAmount(amount: number) {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}
