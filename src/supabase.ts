import { createClient } from '@supabase/supabase-js'
import type { DietPreference, FoodIntolerance, FoodPreferences, GroceryItem, InventoryItem, Recipe, RecipeIngredient } from './types'
import { daysUntilExpiration, expirationDateFromDays } from './freshness'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const cloudEnabled = Boolean(supabaseUrl && supabaseKey)
export const supabase = cloudEnabled ? createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export async function getHouseholdId(userId: string) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.household_id as string | null
}

export async function loadFoodPreferences(userId: string): Promise<FoodPreferences> {
  if (!supabase) return { diet: '', intolerances: [], excludedIngredients: [] }
  const { data, error } = await supabase
    .from('profiles')
    .select('diet,intolerances,excluded_ingredients')
    .eq('id', userId)
    .single()
  if (error) throw error
  return {
    diet: (data.diet || '') as DietPreference | '',
    intolerances: (data.intolerances || []) as FoodIntolerance[],
    excludedIngredients: (data.excluded_ingredients || []) as string[],
  }
}

export async function saveFoodPreferences(userId: string, preferences: FoodPreferences) {
  if (!supabase) return
  const { error } = await supabase.from('profiles').update({
    diet: preferences.diet || null,
    intolerances: preferences.intolerances,
    excluded_ingredients: preferences.excludedIngredients,
  }).eq('id', userId)
  if (error) throw error
}

export async function loadCloudKitchen(householdId: string) {
  if (!supabase) return { inventory: [], grocery: [], recipes: [], initialized: false }
  const [inventoryResult, groceryResult, recipeResult, householdResult] = await Promise.all([
    supabase.from('inventory_items').select('*').eq('household_id', householdId).order('name'),
    supabase.from('grocery_items').select('*').eq('household_id', householdId).order('name'),
    supabase.from('household_recipes').select('*').eq('household_id', householdId).order('name'),
    supabase.from('households').select('initialized').eq('id', householdId).single(),
  ])
  if (inventoryResult.error) throw inventoryResult.error
  if (groceryResult.error) throw groceryResult.error
  if (recipeResult.error) throw recipeResult.error
  if (householdResult.error) throw householdResult.error
  return {
    inventory: (inventoryResult.data || []).map((row) => ({
      id: row.id, name: row.name, emoji: row.emoji, quantity: Number(row.quantity), unit: row.unit,
      category: row.category, location: row.location, expiresIn: row.expires_in,
      expiresOn: row.expires_on || expirationDateFromDays(row.expires_in),
    })) as InventoryItem[],
    grocery: (groceryResult.data || []).map((row) => ({
      name: row.name, amount: Number(row.amount), unit: row.unit, checked: row.checked,
    })) as GroceryItem[],
    recipes: (recipeResult.data || []).map((row) => ({
      id: row.id, name: row.name, description: row.description, time: row.time_minutes,
      servings: row.servings, protein: Number(row.protein_grams), accent: row.accent,
      emoji: row.emoji, ingredients: row.ingredients as RecipeIngredient[],
      instructions: row.instructions as string[], source: 'user' as const,
    })) as Recipe[],
    initialized: Boolean(householdResult.data.initialized),
  }
}

export async function saveRecipeSnapshot(householdId: string, items: Recipe[]) {
  if (!supabase) return
  const rows = items.map((item) => ({
    household_id: householdId, id: item.id, name: item.name, description: item.description,
    time_minutes: item.time, servings: item.servings, protein_grams: item.protein,
    accent: item.accent, emoji: item.emoji, ingredients: item.ingredients,
    instructions: item.instructions || [],
  }))
  if (rows.length) {
    const { error } = await supabase.from('household_recipes').upsert(rows, { onConflict: 'household_id,id' })
    if (error) throw error
    const quotedIds = rows.map((row) => `"${row.id.replaceAll('"', '\\"')}"`).join(',')
    const { error: deleteError } = await supabase.from('household_recipes').delete().eq('household_id', householdId).not('id', 'in', `(${quotedIds})`)
    if (deleteError) throw deleteError
  } else {
    const { error } = await supabase.from('household_recipes').delete().eq('household_id', householdId)
    if (error) throw error
  }
}

export async function markHouseholdInitialized(householdId: string) {
  if (!supabase) return
  const { error } = await supabase.from('households').update({ initialized: true }).eq('id', householdId)
  if (error) throw error
}

export async function saveInventorySnapshot(householdId: string, items: InventoryItem[]) {
  if (!supabase) return
  if (items.length) {
    const { error } = await supabase.from('inventory_items').upsert(items.map((item) => ({
      household_id: householdId, id: item.id, name: item.name, emoji: item.emoji,
      quantity: item.quantity, unit: item.unit, category: item.category, location: item.location,
      expires_in: daysUntilExpiration(item), expires_on: item.expiresOn || expirationDateFromDays(item.expiresIn),
    })), { onConflict: 'household_id,id' })
    if (error) throw error
    const quotedIds = items.map((item) => `"${item.id.replaceAll('"', '\\"')}"`).join(',')
    const { error: deleteError } = await supabase.from('inventory_items').delete().eq('household_id', householdId).not('id', 'in', `(${quotedIds})`)
    if (deleteError) throw deleteError
  } else {
    const { error } = await supabase.from('inventory_items').delete().eq('household_id', householdId)
    if (error) throw error
  }
}

export async function saveGrocerySnapshot(householdId: string, items: GroceryItem[]) {
  if (!supabase) return
  const rows = items.map((item) => ({
    household_id: householdId,
    id: item.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: item.name, amount: item.amount, unit: item.unit, checked: item.checked,
  }))
  if (rows.length) {
    const { error } = await supabase.from('grocery_items').upsert(rows, { onConflict: 'household_id,id' })
    if (error) throw error
    const quotedIds = rows.map((row) => `"${row.id.replaceAll('"', '\\"')}"`).join(',')
    const { error: deleteError } = await supabase.from('grocery_items').delete().eq('household_id', householdId).not('id', 'in', `(${quotedIds})`)
    if (deleteError) throw deleteError
  } else {
    const { error } = await supabase.from('grocery_items').delete().eq('household_id', householdId)
    if (error) throw error
  }
}

export async function submitFeedback(
  householdId: string,
  userId: string,
  category: string,
  message: string,
  context: Record<string, unknown>,
) {
  if (!supabase) throw new Error('Cloud feedback is unavailable.')
  const { error } = await supabase.from('feedback').insert({
    household_id: householdId,
    user_id: userId,
    category,
    message,
    context,
  })
  if (error) throw error
}
