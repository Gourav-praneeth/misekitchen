export type DiscoverIngredient = {
  name: string
  amount: number
  unit: string
  original?: string
}

export type DiscoverRecipe = {
  id: number
  title: string
  image: string | null
  usedIngredientCount: number
  missedIngredientCount: number
  usedIngredients: DiscoverIngredient[]
  missedIngredients: DiscoverIngredient[]
}

export type DiscoverRecipeDetails = {
  id: number
  title: string
  image: string | null
  readyInMinutes: number
  servings: number
  sourceUrl: string | null
  sourceName: string | null
  ingredients: DiscoverIngredient[]
  instructions: string[]
  diets: string[]
}

type ApiPayload<T> = { data?: T; error?: string; quota?: { used: number | null; request: number | null } }

async function requestDiscover<T>(path: string, accessToken: string): Promise<ApiPayload<T>> {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${accessToken}` } })
  const payload = await response.json().catch(() => ({})) as ApiPayload<T>
  if (!response.ok) throw new Error(payload.error || 'Recipe discovery is temporarily unavailable.')
  return payload
}

export function searchDiscoverRecipes(ingredients: string[], accessToken: string) {
  const query = new URLSearchParams({ action: 'search', ingredients: ingredients.join(',') })
  return requestDiscover<DiscoverRecipe[]>(`/api/spoonacular?${query}`, accessToken)
}

export function loadDiscoverRecipe(id: number, accessToken: string) {
  const query = new URLSearchParams({ action: 'details', id: String(id) })
  return requestDiscover<DiscoverRecipeDetails>(`/api/spoonacular?${query}`, accessToken)
}
