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
}

export type GroceryItem = RecipeIngredient & { checked: boolean }
