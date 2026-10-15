export type Category = 'Protein' | 'Produce' | 'Dairy' | 'Pantry' | 'Other'
export type Location = 'Fridge' | 'Freezer' | 'Pantry'

export type ProductSource = 'open-food-facts' | 'household'

export type ProductMetadata = {
  barcode?: string | null
  brand?: string | null
  productImageUrl?: string | null
  packageAmount?: number | null
  packageUnit?: string | null
  productSource?: ProductSource | null
}

export type InventoryItem = ProductMetadata & {
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

export type HouseholdProduct = ProductMetadata & {
  barcode: string
  name: string
  emoji: string
  unit: string
  category: Category
  location: Location
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

export type GroceryStapleGroup = {
  id: string
  name: string
  sortOrder: number
}

export type GroceryStaple = RecipeIngredient & {
  id: string
  groupId: string
  sortOrder: number
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export type MealPlanEntry = {
  id: string
  date: string
  recipeId: string
  servings: number
  mealSlot: MealSlot
}

export type MealPlanTemplateEntry = {
  dayOffset: number
  recipeId: string
  servings: number
  mealSlot: MealSlot
}

export type MealPlanTemplate = {
  id: string
  name: string
  entries: MealPlanTemplateEntry[]
}

export type CookingHistoryEntry = {
  id: string
  recipeId: string
  recipeName: string
  recipeEmoji: string
  servings: number
  timeMinutes: number
  cookedAt: string
  cookedByUserId: string | null
  cookedByName: string
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

export type HouseholdInvite = {
  code: string
  expiresAt: string
  useCount: number
  maxUses: number
}

export type HouseholdActivity = {
  id: string
  actorUserId: string | null
  actorName: string
  action: string
  entityType: string
  entityId: string | null
  description: string
  createdAt: string
}

export type DietPreference = 'Vegetarian' | 'Vegan' | 'Pescetarian' | 'Ketogenic' | 'Paleo' | 'Whole30' | 'Low FODMAP'
export type FoodIntolerance = 'Dairy' | 'Egg' | 'Gluten' | 'Grain' | 'Peanut' | 'Seafood' | 'Sesame' | 'Shellfish' | 'Soy' | 'Sulfite' | 'Tree Nut' | 'Wheat'

export type FoodPreferences = {
  diet: DietPreference | ''
  intolerances: FoodIntolerance[]
  excludedIngredients: string[]
}
