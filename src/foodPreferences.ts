import { normalizeFoodName } from './smartEntry'
import type { DietPreference, FoodIntolerance, FoodPreferences, Recipe } from './types'

export const dietPreferences: DietPreference[] = ['Vegetarian', 'Vegan', 'Pescetarian', 'Ketogenic', 'Paleo', 'Whole30', 'Low FODMAP']
export const foodIntolerances: FoodIntolerance[] = ['Dairy', 'Egg', 'Gluten', 'Grain', 'Peanut', 'Seafood', 'Sesame', 'Shellfish', 'Soy', 'Sulfite', 'Tree Nut', 'Wheat']
export const emptyFoodPreferences: FoodPreferences = { diet: '', intolerances: [], excludedIngredients: [] }

const intoleranceTerms: Record<FoodIntolerance, string[]> = {
  Dairy: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'whey', 'casein'],
  Egg: ['egg', 'eggs', 'mayonnaise'],
  Gluten: ['wheat', 'flour', 'bread', 'pasta', 'barley', 'rye', 'couscous'],
  Grain: ['wheat', 'rice', 'oat', 'oats', 'barley', 'rye', 'corn', 'quinoa'],
  Peanut: ['peanut', 'peanuts'],
  Seafood: ['fish', 'salmon', 'tuna', 'cod', 'anchovy', 'sardine', 'shrimp', 'prawn', 'crab', 'lobster'],
  Sesame: ['sesame', 'tahini'],
  Shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop'],
  Soy: ['soy', 'tofu', 'tempeh', 'edamame', 'miso'],
  Sulfite: ['sulfite', 'sulphite'],
  'Tree Nut': ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia'],
  Wheat: ['wheat', 'flour', 'bread', 'pasta', 'couscous'],
}

const landMeat = ['chicken', 'beef', 'pork', 'bacon', 'ham', 'turkey', 'lamb', 'sausage', 'veal', 'duck']
const animalProducts = [...landMeat, ...intoleranceTerms.Seafood, ...intoleranceTerms.Dairy, ...intoleranceTerms.Egg, 'honey']

function hasTerm(ingredient: string, terms: string[]) {
  const normalized = normalizeFoodName(ingredient)
  return terms.some((term) => normalized === term || normalized.includes(`${term} `) || normalized.includes(` ${term}`))
}

export function preferenceWarnings(recipe: Recipe, preferences: FoodPreferences) {
  const ingredients = recipe.ingredients.map((ingredient) => ingredient.name)
  const warnings = new Set<string>()

  for (const excluded of preferences.excludedIngredients) {
    if (excluded.trim() && ingredients.some((ingredient) => hasTerm(ingredient, [normalizeFoodName(excluded)]))) warnings.add(`Contains ${excluded}`)
  }
  for (const intolerance of preferences.intolerances) {
    if (ingredients.some((ingredient) => hasTerm(ingredient, intoleranceTerms[intolerance]))) warnings.add(`May contain ${intolerance.toLowerCase()}`)
  }
  const dietTerms = preferences.diet === 'Vegan' ? animalProducts
    : preferences.diet === 'Vegetarian' ? [...landMeat, ...intoleranceTerms.Seafood]
      : preferences.diet === 'Pescetarian' ? landMeat
        : []
  if (dietTerms.length && ingredients.some((ingredient) => hasTerm(ingredient, dietTerms))) warnings.add(`May not be ${preferences.diet.toLowerCase()}`)
  return [...warnings]
}

export function foodPreferenceSummary(preferences: FoodPreferences) {
  return [preferences.diet, ...preferences.intolerances, ...preferences.excludedIngredients.map((item) => `No ${item}`)].filter(Boolean)
}
