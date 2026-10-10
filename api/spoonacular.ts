declare const process: { env: Record<string, string | undefined> }

type SpoonIngredient = { name?: string; amount?: number; unit?: string; original?: string }
type CacheEntry = { expiresAt: number; response: unknown; quota: { used: number | null; request: number | null } }

const cache = new Map<string, CacheEntry>()
const CACHE_MS = 55 * 60 * 1000
const diets = new Set(['Vegetarian', 'Vegan', 'Pescetarian', 'Ketogenic', 'Paleo', 'Whole30', 'Low FODMAP'])
const intolerances = new Set(['Dairy', 'Egg', 'Gluten', 'Grain', 'Peanut', 'Seafood', 'Sesame', 'Shellfish', 'Soy', 'Sulfite', 'Tree Nut', 'Wheat'])

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

function ingredient(value: SpoonIngredient) {
  return {
    name: String(value.name || 'Ingredient'),
    amount: Number(value.amount || 1),
    unit: String(value.unit || 'item'),
    original: value.original ? String(value.original) : undefined,
  }
}

function safeUrl(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch { return null }
}

async function authenticated(request: Request) {
  const token = request.headers.get('authorization')
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!token?.startsWith('Bearer ') || !supabaseUrl || !publishableKey) return false
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: token, apikey: publishableKey },
  })
  return response.ok
}

async function spoonacular(path: string, cacheKey: string) {
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached
  const apiKey = process.env.SPOONACULAR_API_KEY
  if (!apiKey) throw new Error('SPOONACULAR_API_KEY is not configured in Vercel.')
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`https://api.spoonacular.com${path}${separator}apiKey=${encodeURIComponent(apiKey)}`)
  const parseQuota = (value: string | null) => value === null || value.trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value)
  const quota = { used: parseQuota(response.headers.get('x-api-quota-used')), request: parseQuota(response.headers.get('x-api-quota-request')) }
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 402) throw new Error('The daily Spoonacular discovery limit has been reached. Mise recipes are still available.')
    throw new Error((payload as { message?: string } | null)?.message || 'Spoonacular could not return recipes right now.')
  }
  const entry = { response: payload, quota, expiresAt: Date.now() + CACHE_MS }
  cache.set(cacheKey, entry)
  return entry
}

async function handle(request: Request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
  if (!await authenticated(request)) return json({ error: 'Sign in to discover recipes.' }, 401)
  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  if (action === 'search') {
    const ingredients = (url.searchParams.get('ingredients') || '').split(',')
      .map((value) => value.trim().replace(/[^a-zA-Z0-9 '-]/g, ''))
      .filter(Boolean).slice(0, 15)
    if (!ingredients.length) return json({ error: 'Add ingredients to your kitchen before discovering recipes.' }, 400)
    const diet = url.searchParams.get('diet') || ''
    const selectedDiet = diets.has(diet) ? diet : ''
    const selectedIntolerances = (url.searchParams.get('intolerances') || '').split(',').map((value) => value.trim()).filter((value) => intolerances.has(value)).slice(0, 12)
    const excludedIngredients = (url.searchParams.get('excludeIngredients') || '').split(',')
      .map((value) => value.trim().replace(/[^a-zA-Z0-9 '-]/g, ''))
      .filter(Boolean).slice(0, 12)
    const query = new URLSearchParams({
      includeIngredients: ingredients.join(','), number: '9', sort: 'max-used-ingredients',
      fillIngredients: 'true', instructionsRequired: 'true', ignorePantry: 'true',
    })
    if (selectedDiet) query.set('diet', selectedDiet)
    if (selectedIntolerances.length) query.set('intolerances', selectedIntolerances.join(','))
    if (excludedIngredients.length) query.set('excludeIngredients', excludedIngredients.join(','))
    const preferenceKey = [selectedDiet, selectedIntolerances.sort().join('|'), excludedIngredients.sort().join('|')].join(':').toLowerCase()
    const { response, quota } = await spoonacular(`/recipes/complexSearch?${query}`, `search:${[...ingredients].sort().join('|').toLowerCase()}:${preferenceKey}`)
    const result = response && typeof response === 'object' && Array.isArray((response as { results?: unknown[] }).results)
      ? (response as { results: Array<Record<string, unknown>> }).results : []
    const recipes = result.map((recipe: Record<string, unknown>) => ({
      id: Number(recipe.id), title: String(recipe.title || 'Untitled recipe'),
      image: safeUrl(recipe.image),
      usedIngredientCount: Number(recipe.usedIngredientCount || (Array.isArray(recipe.usedIngredients) ? recipe.usedIngredients.length : 0)),
      missedIngredientCount: Number(recipe.missedIngredientCount || (Array.isArray(recipe.missedIngredients) ? recipe.missedIngredients.length : 0)),
      usedIngredients: (Array.isArray(recipe.usedIngredients) ? recipe.usedIngredients : []).map(ingredient),
      missedIngredients: (Array.isArray(recipe.missedIngredients) ? recipe.missedIngredients : []).map(ingredient),
    }))
    return json({ data: recipes, quota })
  }

  if (action === 'details') {
    const id = Number(url.searchParams.get('id'))
    if (!Number.isInteger(id) || id <= 0) return json({ error: 'A valid recipe is required.' }, 400)
    const { response, quota } = await spoonacular(`/recipes/${id}/information?includeNutrition=false`, `details:${id}`)
    const recipe = response as Record<string, unknown>
    const instructionGroups = Array.isArray(recipe.analyzedInstructions) ? recipe.analyzedInstructions as Array<{ steps?: Array<{ step?: string }> }> : []
    const instructions = instructionGroups.flatMap((group) => group.steps || []).map((step) => String(step.step || '').trim()).filter(Boolean)
    return json({ data: {
      id, title: String(recipe.title || 'Untitled recipe'), image: safeUrl(recipe.image),
      readyInMinutes: Number(recipe.readyInMinutes || 0), servings: Number(recipe.servings || 1),
      sourceUrl: safeUrl(recipe.sourceUrl),
      sourceName: typeof recipe.sourceName === 'string' ? recipe.sourceName : null,
      ingredients: (Array.isArray(recipe.extendedIngredients) ? recipe.extendedIngredients : []).map(ingredient),
      instructions, diets: Array.isArray(recipe.diets) ? recipe.diets.map(String) : [],
    }, quota })
  }

  return json({ error: 'Unknown recipe discovery action.' }, 400)
}

export default {
  async fetch(request: Request) {
    try { return await handle(request) }
    catch (error) { return json({ error: error instanceof Error ? error.message : 'Recipe discovery failed.' }, 502) }
  },
}
