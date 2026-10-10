export type Category = 'Protein' | 'Produce' | 'Dairy' | 'Pantry' | 'Other'
export type Location = 'Fridge' | 'Freezer' | 'Pantry'

export type InventoryItem = {
  id: string
  name: string
  emoji: string
  quantity: number
  unit: string
  category: Category
  location: Location
  expiresIn: number | null
  expiresOn?: string | null
}

export type RecipeIngredient = {
  name: string
  amount: number
  unit: string
}

export type Recipe = {
  id: string
  name: string
  description: string
  time: number
  servings: number
  protein: number
  accent: string
  emoji: string
  ingredients: RecipeIngredient[]
  instructions?: string[]
  source?: 'mise' | 'user' | 'spoonacular'
  externalId?: number | null
  sourceUrl?: string | null
  imageUrl?: string | null
}

export type GroceryItem = RecipeIngredient & { checked: boolean }

export type MealPlanEntry = {
  id: string
  date: string
  recipeId: string
  servings: number
  mealSlot: 'dinner'
}

export type HouseholdSummary = {
  id: string
  name: string
  role: 'owner' | 'member'
  memberCount: number
}

export type HouseholdMember = {
  userId: string
  displayName: string
  role: 'owner' | 'member'
  joinedAt: string
}

export type DietPreference = 'Vegetarian' | 'Vegan' | 'Pescetarian' | 'Ketogenic' | 'Paleo' | 'Whole30' | 'Low FODMAP'
export type FoodIntolerance = 'Dairy' | 'Egg' | 'Gluten' | 'Grain' | 'Peanut' | 'Seafood' | 'Sesame' | 'Shellfish' | 'Soy' | 'Sulfite' | 'Tree Nut' | 'Wheat'

export type FoodPreferences = {
  diet: DietPreference | ''
  intolerances: FoodIntolerance[]
  excludedIngredients: string[]
}
