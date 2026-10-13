import { createClient } from '@supabase/supabase-js'
import type { DietPreference, FoodIntolerance, FoodPreferences, GroceryItem, GroceryStaple, GroceryStapleGroup, HouseholdActivity, HouseholdInvite, HouseholdMember, HouseholdSummary, InventoryItem, MealPlanEntry, Recipe, RecipeIngredient } from './types'
import { daysUntilExpiration, expirationDateFromDays } from './freshness'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const cloudEnabled = Boolean(supabaseUrl && supabaseKey)
export const supabase = cloudEnabled ? createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export async function getHouseholdId() {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_active_household_id')
  if (error) throw error
  return data as string | null
}

export async function loadHouseholds(): Promise<HouseholdSummary[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_my_households')
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id), name: String(row.name), role: row.member_role as HouseholdSummary['role'], memberCount: Number(row.member_count),
  }))
}

export async function loadHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_household_members', { target_household_id: householdId })
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => ({
    userId: String(row.user_id), displayName: String(row.display_name), role: row.member_role as HouseholdMember['role'], joinedAt: String(row.joined_at),
  }))
}

export async function createHouseholdInvite(householdId: string) {
  if (!supabase) throw new Error('Cloud kitchens are not enabled.')
  const { data, error } = await supabase.rpc('create_household_invite', { target_household_id: householdId })
  if (error) throw error
  const invite = data?.[0]
  if (!invite) throw new Error('Invite code could not be created.')
  return { code: String(invite.invite_code), expiresAt: String(invite.expires_at), useCount: 0, maxUses: Number(invite.max_uses || 8) } as HouseholdInvite
}

export async function loadActiveHouseholdInvite(householdId: string): Promise<HouseholdInvite | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_active_household_invite', { target_household_id: householdId })
  if (error) throw error
  const invite = data?.[0]
  return invite ? { code: String(invite.invite_code), expiresAt: String(invite.expires_at), useCount: Number(invite.use_count), maxUses: Number(invite.max_uses) } : null
}

export async function revokeHouseholdInvite(householdId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('revoke_household_invite', { target_household_id: householdId })
  if (error) throw error
}

export async function updateHouseholdMemberRole(householdId: string, userId: string, role: HouseholdMember['role']) {
  if (!supabase) return
  const { error } = await supabase.rpc('set_household_member_role', { target_household_id: householdId, target_user_id: userId, next_role: role })
  if (error) throw error
}

export async function removeHouseholdMember(householdId: string, userId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('remove_household_member', { target_household_id: householdId, target_user_id: userId })
  if (error) throw error
}

export async function loadHouseholdActivity(householdId: string): Promise<HouseholdActivity[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_household_activity', { target_household_id: householdId, activity_limit: 15 })
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id), actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actorName: String(row.actor_name || 'Mise'), action: String(row.action), entityType: String(row.entity_type),
    entityId: row.entity_id ? String(row.entity_id) : null, description: String(row.description), createdAt: String(row.created_at),
  }))
}

export async function setMiseRecipeHidden(householdId: string, recipeId: string, recipeName: string, hidden: boolean) {
  if (!supabase) return
  const { error } = await supabase.rpc('set_mise_recipe_hidden', { target_household_id: householdId, recipe_id: recipeId, recipe_name: recipeName, hidden })
  if (error) throw error
}

export async function joinHousehold(inviteCode: string) {
  if (!supabase) throw new Error('Cloud kitchens are not enabled.')
  const { data, error } = await supabase.rpc('join_household_by_code', { invite_code: inviteCode })
  if (error) throw error
  return data as string
}

export async function setActiveHousehold(householdId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('set_active_household', { target_household_id: householdId })
  if (error) throw error
}

export async function renameHousehold(householdId: string, name: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('rename_household', { target_household_id: householdId, next_name: name })
  if (error) throw error
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
  if (!supabase) return { inventory: [], grocery: [], stapleGroups: [], staples: [], recipes: [], mealPlan: [], hiddenMiseRecipeIds: [], initialized: false }
  const [inventoryResult, groceryResult, stapleGroupResult, stapleResult, recipeResult, mealPlanResult, householdResult] = await Promise.all([
    supabase.from('inventory_items').select('*').eq('household_id', householdId).order('name'),
    supabase.from('grocery_items').select('*').eq('household_id', householdId).order('name'),
    supabase.from('grocery_staple_groups').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('grocery_staples').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('household_recipes').select('*').eq('household_id', householdId).order('name'),
    supabase.from('meal_plan_entries').select('*').eq('household_id', householdId).order('plan_date'),
    supabase.from('households').select('initialized,hidden_mise_recipe_ids').eq('id', householdId).single(),
  ])
  if (inventoryResult.error) throw inventoryResult.error
  if (groceryResult.error) throw groceryResult.error
  if (stapleGroupResult.error) throw stapleGroupResult.error
  if (stapleResult.error) throw stapleResult.error
  if (recipeResult.error) throw recipeResult.error
  if (mealPlanResult.error) throw mealPlanResult.error
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
    stapleGroups: (stapleGroupResult.data || []).map((row) => ({
      id: row.id, name: row.name, sortOrder: Number(row.sort_order),
    })) as GroceryStapleGroup[],
    staples: (stapleResult.data || []).map((row) => ({
      id: row.id, groupId: row.group_id, name: row.name, amount: Number(row.amount), unit: row.unit, sortOrder: Number(row.sort_order),
    })) as GroceryStaple[],
    recipes: (recipeResult.data || []).map((row) => ({
      id: row.id, name: row.name, description: row.description, time: row.time_minutes,
      servings: row.servings, protein: Number(row.protein_grams), accent: row.accent,
      emoji: row.emoji, ingredients: row.ingredients as RecipeIngredient[],
      instructions: row.instructions as string[], source: (row.recipe_source || 'user') as Recipe['source'],
      externalId: row.external_id, sourceUrl: row.source_url, imageUrl: row.image_url,
    })) as Recipe[],
    mealPlan: (mealPlanResult.data || []).map((row) => ({
      id: row.id, date: row.plan_date, recipeId: row.recipe_id,
      servings: Number(row.servings), mealSlot: row.meal_slot,
    })) as MealPlanEntry[],
    hiddenMiseRecipeIds: (householdResult.data.hidden_mise_recipe_ids || []) as string[],
    initialized: Boolean(householdResult.data.initialized),
  }
}

export async function saveMealPlanSnapshot(householdId: string, entries: MealPlanEntry[]) {
  if (!supabase) return
  const rows = entries.map((entry) => ({
    household_id: householdId, id: entry.id, plan_date: entry.date,
    recipe_id: entry.recipeId, servings: entry.servings, meal_slot: entry.mealSlot,
  }))
  if (rows.length) {
    const { error } = await supabase.from('meal_plan_entries').upsert(rows, { onConflict: 'household_id,id' })
    if (error) throw error
    const quotedIds = rows.map((row) => `"${row.id.replaceAll('"', '\\"')}"`).join(',')
    const { error: deleteError } = await supabase.from('meal_plan_entries').delete().eq('household_id', householdId).not('id', 'in', `(${quotedIds})`)
    if (deleteError) throw deleteError
  } else {
    const { error } = await supabase.from('meal_plan_entries').delete().eq('household_id', householdId)
    if (error) throw error
  }
}

export async function saveRecipeSnapshot(householdId: string, items: Recipe[]) {
  if (!supabase) return
  const rows = items.map((item) => ({
    household_id: householdId, id: item.id, name: item.name, description: item.description,
    time_minutes: item.time, servings: item.servings, protein_grams: item.protein,
    accent: item.accent, emoji: item.emoji, ingredients: item.ingredients,
    instructions: item.instructions || [],
    recipe_source: item.source === 'spoonacular' ? 'spoonacular' : 'user',
    external_id: item.externalId || null, source_url: item.sourceUrl || null, image_url: item.imageUrl || null,
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
    id: `${item.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${item.unit.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
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

export async function saveStaplesSnapshot(householdId: string, groups: GroceryStapleGroup[], staples: GroceryStaple[]) {
  if (!supabase) return
  if (!groups.length) {
    const { error } = await supabase.from('grocery_staple_groups').delete().eq('household_id', householdId)
    if (error) throw error
    return
  }
  const groupRows = groups.map((group) => ({ household_id: householdId, id: group.id, name: group.name, sort_order: group.sortOrder }))
  const { error: groupError } = await supabase.from('grocery_staple_groups').upsert(groupRows, { onConflict: 'household_id,id' })
  if (groupError) throw groupError
  const groupIds = groupRows.map((row) => `"${row.id.replaceAll('"', '\\"')}"`).join(',')
  const { error: deleteGroupError } = await supabase.from('grocery_staple_groups').delete().eq('household_id', householdId).not('id', 'in', `(${groupIds})`)
  if (deleteGroupError) throw deleteGroupError

  if (!staples.length) {
    const { error } = await supabase.from('grocery_staples').delete().eq('household_id', householdId)
    if (error) throw error
    return
  }
  const stapleRows = staples.map((staple) => ({
    household_id: householdId, id: staple.id, group_id: staple.groupId,
    name: staple.name, amount: staple.amount, unit: staple.unit, sort_order: staple.sortOrder,
  }))
  const { error: stapleError } = await supabase.from('grocery_staples').upsert(stapleRows, { onConflict: 'household_id,id' })
  if (stapleError) throw stapleError
  const stapleIds = stapleRows.map((row) => `"${row.id.replaceAll('"', '\\"')}"`).join(',')
  const { error: deleteStapleError } = await supabase.from('grocery_staples').delete().eq('household_id', householdId).not('id', 'in', `(${stapleIds})`)
  if (deleteStapleError) throw deleteStapleError
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
