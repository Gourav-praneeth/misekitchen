import { createClient } from '@supabase/supabase-js'
import { changedSnapshotRows, removedSnapshotRowIds, type CollaborativeKitchenSnapshot, type KitchenCollection } from './collaborationSync'
import type { CookingHistoryEntry, DietPreference, FoodIntolerance, FoodPreferences, GroceryItem, GroceryStaple, GroceryStapleGroup, HouseholdActivity, HouseholdFoodMapping, HouseholdInvite, HouseholdMember, HouseholdProduct, HouseholdSummary, InventoryItem, MealPlanEntry, MealPlanTemplate, Recipe, RecipeIngredient } from './types'
import { expirationDateFromDays, legacyExpirationDaysForStorage } from './freshness'

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
  if (!supabase) return { inventory: [], grocery: [], stapleGroups: [], staples: [], recipes: [], mealPlan: [], mealPlanTemplates: [], cookingHistory: [], productMemory: [], hiddenMiseRecipeIds: [], initialized: false }
  const [inventoryResult, groceryResult, stapleGroupResult, stapleResult, recipeResult, mealPlanResult, templateResult, cookingHistoryResult, productMemoryResult, householdResult] = await Promise.all([
    supabase.from('inventory_items').select('*').eq('household_id', householdId).order('name'),
    supabase.from('grocery_items').select('*').eq('household_id', householdId).order('name'),
    supabase.from('grocery_staple_groups').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('grocery_staples').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('household_recipes').select('*').eq('household_id', householdId).order('name'),
    supabase.from('meal_plan_entries').select('*').eq('household_id', householdId).order('plan_date'),
    supabase.from('meal_plan_templates').select('*').eq('household_id', householdId).order('updated_at', { ascending: false }),
    supabase.from('cooking_history').select('*').eq('household_id', householdId).order('cooked_at', { ascending: false }).limit(100),
    supabase.from('household_products').select('*').eq('household_id', householdId).order('updated_at', { ascending: false }),
    supabase.from('households').select('initialized,hidden_mise_recipe_ids').eq('id', householdId).single(),
  ])
  if (inventoryResult.error) throw inventoryResult.error
  if (groceryResult.error) throw groceryResult.error
  if (stapleGroupResult.error) throw stapleGroupResult.error
  if (stapleResult.error) throw stapleResult.error
  if (recipeResult.error) throw recipeResult.error
  if (mealPlanResult.error) throw mealPlanResult.error
  if (templateResult.error) throw templateResult.error
  // Keep older deployments usable until the cooking-history migration is run.
  if (cookingHistoryResult.error && !['42P01', 'PGRST205'].includes(cookingHistoryResult.error.code || '')) throw cookingHistoryResult.error
  // Keep older deployments usable until the household-product memory migration is run.
  if (productMemoryResult.error && !['42P01', 'PGRST205'].includes(productMemoryResult.error.code || '')) throw productMemoryResult.error
  if (householdResult.error) throw householdResult.error
  return {
    inventory: (inventoryResult.data || []).map((row) => ({
      id: row.id, name: row.name, emoji: row.emoji, quantity: Number(row.quantity), unit: row.unit,
      category: row.category, location: row.location, expiresIn: row.expires_in,
      expiresOn: row.expires_on || expirationDateFromDays(row.expires_in),
      barcode: row.barcode || null, brand: row.brand || null, productImageUrl: row.product_image_url || null,
      packageAmount: row.package_amount === null ? null : Number(row.package_amount), packageUnit: row.package_unit || null,
      productSource: row.product_source || null,
    })) as InventoryItem[],
    grocery: (groceryResult.data || []).map((row) => ({
      id: row.id, name: row.name, amount: Number(row.amount), unit: row.unit, checked: row.checked,
      createdAt: row.created_at || null, createdBy: row.created_by || null,
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
    mealPlanTemplates: (templateResult.data || []).map((row) => ({
      id: row.id, name: row.name, entries: row.entries,
    })) as MealPlanTemplate[],
    cookingHistory: (cookingHistoryResult.data || []).map((row) => ({
      id: row.id, recipeId: row.recipe_id, recipeName: row.recipe_name, recipeEmoji: row.recipe_emoji,
      servings: Number(row.servings), timeMinutes: Number(row.time_minutes), cookedAt: row.cooked_at,
      cookedByUserId: row.cooked_by_user_id, cookedByName: row.cooked_by_name || 'Kitchen member',
    })) as CookingHistoryEntry[],
    productMemory: (productMemoryResult.data || []).map((row) => ({
      barcode: row.barcode, name: row.name, emoji: row.emoji, unit: row.unit,
      category: row.category, location: row.location, brand: row.brand || null,
      productImageUrl: row.product_image_url || null,
      packageAmount: row.package_amount === null ? null : Number(row.package_amount),
      packageUnit: row.package_unit || null, productSource: 'household',
    })) as HouseholdProduct[],
    hiddenMiseRecipeIds: (householdResult.data.hidden_mise_recipe_ids || []) as string[],
    initialized: Boolean(householdResult.data.initialized),
  }
}

export async function loadRememberedProduct(householdId: string, barcode: string): Promise<HouseholdProduct | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('household_products')
    .select('*')
    .eq('household_id', householdId)
    .eq('barcode', barcode)
    .maybeSingle()
  // Let a deployment remain usable until the optional memory migration is applied.
  if (error && ['42P01', 'PGRST205'].includes(error.code || '')) return null
  if (error) throw error
  if (!data) return null
  return {
    barcode: data.barcode,
    name: data.name,
    emoji: data.emoji,
    unit: data.unit,
    category: data.category,
    location: data.location,
    brand: data.brand || null,
    productImageUrl: data.product_image_url || null,
    packageAmount: data.package_amount === null ? null : Number(data.package_amount),
    packageUnit: data.package_unit || null,
    productSource: 'household',
  } as HouseholdProduct
}

export async function saveCookingHistoryEntry(householdId: string, entry: CookingHistoryEntry) {
  if (!supabase) return
  const { error } = await supabase.from('cooking_history').insert({
    household_id: householdId, id: entry.id, recipe_id: entry.recipeId, recipe_name: entry.recipeName,
    recipe_emoji: entry.recipeEmoji, servings: entry.servings, time_minutes: entry.timeMinutes,
    cooked_at: entry.cookedAt, cooked_by_user_id: entry.cookedByUserId, cooked_by_name: entry.cookedByName,
  })
  if (error) throw error
}

export async function deleteCookingHistoryEntry(householdId: string, entryId: string) {
  if (!supabase) return
  const { error } = await supabase.from('cooking_history').delete().eq('household_id', householdId).eq('id', entryId)
  if (error) throw error
}

async function deleteSnapshotRows(table: string, householdId: string, currentIds: string[], previousIds?: string[]) {
  if (!supabase) return
  if (previousIds) {
    const removedIds = removedSnapshotRowIds(currentIds.map((id) => ({ id })), previousIds.map((id) => ({ id })))
    if (!removedIds.length) return
    const { error } = await supabase.from(table).delete().eq('household_id', householdId).in('id', removedIds)
    if (error) throw error
    return
  }
  if (!currentIds.length) {
    const { error } = await supabase.from(table).delete().eq('household_id', householdId)
    if (error) throw error
    return
  }
  const quotedIds = currentIds.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(',')
  const { error } = await supabase.from(table).delete().eq('household_id', householdId).not('id', 'in', `(${quotedIds})`)
  if (error) throw error
}

export async function saveMealPlanSnapshot(householdId: string, entries: MealPlanEntry[], previousEntries?: MealPlanEntry[], force = false) {
  if (!supabase) return
  const rows = entries.map((entry) => ({
    household_id: householdId, id: entry.id, plan_date: entry.date,
    recipe_id: entry.recipeId, servings: entry.servings, meal_slot: entry.mealSlot,
  }))
  const previousRows = previousEntries?.map((entry) => ({
    household_id: householdId, id: entry.id, plan_date: entry.date,
    recipe_id: entry.recipeId, servings: entry.servings, meal_slot: entry.mealSlot,
  }))
  const upserts = changedSnapshotRows(rows, previousRows, force)
  if (upserts.length) {
    const { error } = await supabase.from('meal_plan_entries').upsert(upserts, { onConflict: 'household_id,id' })
    if (error) throw error
  }
  await deleteSnapshotRows('meal_plan_entries', householdId, rows.map((row) => row.id), previousRows?.map((row) => row.id))
}

export async function saveMealPlanTemplateSnapshot(householdId: string, templates: MealPlanTemplate[], previousTemplates?: MealPlanTemplate[], force = false) {
  if (!supabase) return
  const rows = templates.map((template) => ({
    household_id: householdId, id: template.id, name: template.name, entries: template.entries,
  }))
  const previousRows = previousTemplates?.map((template) => ({
    household_id: householdId, id: template.id, name: template.name, entries: template.entries,
  }))
  const upserts = changedSnapshotRows(rows, previousRows, force)
  if (upserts.length) {
    const { error } = await supabase.from('meal_plan_templates').upsert(upserts, { onConflict: 'household_id,id' })
    if (error) throw error
  }
  await deleteSnapshotRows('meal_plan_templates', householdId, rows.map((row) => row.id), previousRows?.map((row) => row.id))
}

export async function deleteMealPlanTemplate(householdId: string, templateId: string) {
  if (!supabase) return
  const { error } = await supabase.from('meal_plan_templates').delete().eq('household_id', householdId).eq('id', templateId)
  if (error) throw error
}

export async function saveRecipeSnapshot(householdId: string, items: Recipe[], previousItems?: Recipe[], force = false) {
  if (!supabase) return
  const rows = items.map((item) => ({
    household_id: householdId, id: item.id, name: item.name, description: item.description,
    time_minutes: item.time, servings: item.servings, protein_grams: item.protein,
    accent: item.accent, emoji: item.emoji, ingredients: item.ingredients,
    instructions: item.instructions || [],
    recipe_source: item.source === 'spoonacular' ? 'spoonacular' : 'user',
    external_id: item.externalId || null, source_url: item.sourceUrl || null, image_url: item.imageUrl || null,
  }))
  const previousRows = previousItems?.map((item) => ({
    household_id: householdId, id: item.id, name: item.name, description: item.description,
    time_minutes: item.time, servings: item.servings, protein_grams: item.protein,
    accent: item.accent, emoji: item.emoji, ingredients: item.ingredients,
    instructions: item.instructions || [],
    recipe_source: item.source === 'spoonacular' ? 'spoonacular' : 'user',
    external_id: item.externalId || null, source_url: item.sourceUrl || null, image_url: item.imageUrl || null,
  }))
  const upserts = changedSnapshotRows(rows, previousRows, force)
  if (upserts.length) {
    const { error } = await supabase.from('household_recipes').upsert(upserts, { onConflict: 'household_id,id' })
    if (error) throw error
  }
  await deleteSnapshotRows('household_recipes', householdId, rows.map((row) => row.id), previousRows?.map((row) => row.id))
}

export async function markHouseholdInitialized(householdId: string) {
  if (!supabase) return
  const { error } = await supabase.from('households').update({ initialized: true }).eq('id', householdId)
  if (error) throw error
}

export async function saveInventorySnapshot(householdId: string, items: InventoryItem[], previousItems?: InventoryItem[], force = false) {
  if (!supabase) return
  const inventoryRows = (source: InventoryItem[]) => {
    const baseRows = source.map((item) => ({
      household_id: householdId, id: item.id, name: item.name, emoji: item.emoji,
      quantity: 1, unit: 'item', category: item.category, location: item.location,
      expires_in: legacyExpirationDaysForStorage(item), expires_on: item.expiresOn || expirationDateFromDays(item.expiresIn),
    }))
    return source.map((item, index) => ({
      ...baseRows[index],
      barcode: item.barcode || null, brand: item.brand || null, product_image_url: item.productImageUrl || null,
      package_amount: item.packageAmount || null, package_unit: item.packageUnit || null, product_source: item.productSource || null,
    }))
  }
  const productRows = inventoryRows(items)
  const previousRows = previousItems ? inventoryRows(previousItems) : undefined
  const upserts = changedSnapshotRows(productRows, previousRows, force)
  if (upserts.length) {
    let { error } = await supabase.from('inventory_items').upsert(upserts, { onConflict: 'household_id,id' })
    // Keep production saves working while the optional product-identity migration is being applied.
    if (error && ['42703', 'PGRST204'].includes(error.code || '')) {
      const fallbackRows = upserts.map((row) => ({
        household_id: row.household_id, id: row.id, name: row.name, emoji: row.emoji,
        quantity: row.quantity, unit: row.unit, category: row.category, location: row.location,
        expires_in: row.expires_in, expires_on: row.expires_on,
      }))
      const fallback = await supabase.from('inventory_items').upsert(fallbackRows, { onConflict: 'household_id,id' })
      error = fallback.error
    }
    if (error) throw error
  }
  await deleteSnapshotRows('inventory_items', householdId, productRows.map((row) => row.id), previousRows?.map((row) => row.id))
}

export async function saveGrocerySnapshot(householdId: string, items: GroceryItem[], previousItems?: GroceryItem[], force = false) {
  if (!supabase) return
  const rows = items.map((item) => ({
    household_id: householdId,
    id: item.id || `${item.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${item.unit.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: item.name, amount: item.amount, unit: item.unit, checked: item.checked,
  }))
  const previousRows = previousItems?.map((item) => ({
    household_id: householdId,
    id: item.id || `${item.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${item.unit.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: item.name, amount: item.amount, unit: item.unit, checked: item.checked,
  }))
  const upserts = changedSnapshotRows(rows, previousRows, force)
  if (upserts.length) {
    const { error } = await supabase.from('grocery_items').upsert(upserts, { onConflict: 'household_id,id' })
    if (error) throw error
  }
  await deleteSnapshotRows('grocery_items', householdId, rows.map((row) => row.id), previousRows?.map((row) => row.id))
}

export async function loadGroceryItems(householdId: string): Promise<GroceryItem[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('grocery_items').select('*').eq('household_id', householdId).order('name')
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id, name: row.name, amount: Number(row.amount), unit: row.unit, checked: row.checked,
    createdAt: row.created_at || null, createdBy: row.created_by || null,
  }))
}

export async function loadGroceryLastSeen(householdId: string, userId: string) {
  if (!supabase) return null
  const { data, error } = await supabase.from('household_grocery_read_state').select('last_seen_at').eq('household_id', householdId).eq('user_id', userId).maybeSingle()
  if (error && ['42P01', 'PGRST205'].includes(error.code || '')) return null
  if (error) throw error
  return data?.last_seen_at ? String(data.last_seen_at) : null
}

export async function markGrocerySeen(householdId: string, userId: string, seenAt = new Date().toISOString()) {
  if (!supabase) return
  const { error } = await supabase.from('household_grocery_read_state').upsert({ household_id: householdId, user_id: userId, last_seen_at: seenAt }, { onConflict: 'household_id,user_id' })
  if (error && ['42P01', 'PGRST205'].includes(error.code || '')) return
  if (error) throw error
}

export async function loadHouseholdFoodMappings(householdId: string): Promise<HouseholdFoodMapping[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('household_food_mappings').select('*').eq('household_id', householdId)
  if (error && ['42P01', 'PGRST205'].includes(error.code || '')) return []
  if (error) throw error
  return (data || []).map((row) => ({ normalizedName: row.normalized_name, displayName: row.display_name, emoji: row.emoji, category: row.category, location: row.location })) as HouseholdFoodMapping[]
}

export async function saveHouseholdFoodMapping(householdId: string, mapping: HouseholdFoodMapping) {
  if (!supabase) return
  const { error } = await supabase.from('household_food_mappings').upsert({
    household_id: householdId, normalized_name: mapping.normalizedName, display_name: mapping.displayName,
    emoji: mapping.emoji, category: mapping.category, location: mapping.location, updated_at: new Date().toISOString(),
  }, { onConflict: 'household_id,normalized_name' })
  if (error && ['42P01', 'PGRST205'].includes(error.code || '')) return
  if (error) throw error
}

export async function recordUnknownFoodTerm(name: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('record_unknown_food_term', { food_name: name })
  if (error && ['42883', 'PGRST202'].includes(error.code || '')) return
  if (error) throw error
}

export async function saveStaplesSnapshot(
  householdId: string,
  groups: GroceryStapleGroup[],
  staples: GroceryStaple[],
  previousGroups?: GroceryStapleGroup[],
  previousStaples?: GroceryStaple[],
  force = false,
) {
  if (!supabase) return
  const groupRows = groups.map((group) => ({ household_id: householdId, id: group.id, name: group.name, sort_order: group.sortOrder }))
  const previousGroupRows = previousGroups?.map((group) => ({ household_id: householdId, id: group.id, name: group.name, sort_order: group.sortOrder }))
  const groupUpserts = changedSnapshotRows(groupRows, previousGroupRows, force)
  if (groupUpserts.length) {
    const { error } = await supabase.from('grocery_staple_groups').upsert(groupUpserts, { onConflict: 'household_id,id' })
    if (error) throw error
  }
  const stapleRows = staples.map((staple) => ({
    household_id: householdId, id: staple.id, group_id: staple.groupId,
    name: staple.name, amount: staple.amount, unit: staple.unit, sort_order: staple.sortOrder,
  }))
  const previousStapleRows = previousStaples?.map((staple) => ({
    household_id: householdId, id: staple.id, group_id: staple.groupId,
    name: staple.name, amount: staple.amount, unit: staple.unit, sort_order: staple.sortOrder,
  }))
  const stapleUpserts = changedSnapshotRows(stapleRows, previousStapleRows, force)
  if (stapleUpserts.length) {
    const { error } = await supabase.from('grocery_staples').upsert(stapleUpserts, { onConflict: 'household_id,id' })
    if (error) throw error
  }
  await deleteSnapshotRows('grocery_staples', householdId, stapleRows.map((row) => row.id), previousStapleRows?.map((row) => row.id))
  await deleteSnapshotRows('grocery_staple_groups', householdId, groupRows.map((row) => row.id), previousGroupRows?.map((row) => row.id))
}

export async function saveKitchenSnapshot(
  householdId: string,
  snapshot: CollaborativeKitchenSnapshot,
  collections: KitchenCollection[] = ['inventory', 'grocery', 'staples', 'recipes', 'mealPlan', 'mealPlanTemplates'],
  previous?: CollaborativeKitchenSnapshot | null,
  forcedCollections: KitchenCollection[] = [],
) {
  const selected = new Set(collections)
  const forced = new Set(forcedCollections)
  const operations: Array<readonly [string, Promise<void>]> = [
    ...(selected.has('inventory') ? [['inventory', saveInventorySnapshot(householdId, snapshot.inventory, previous?.inventory, forced.has('inventory'))] as const] : []),
    ...(selected.has('grocery') ? [['grocery list', saveGrocerySnapshot(householdId, snapshot.grocery, previous?.grocery, forced.has('grocery'))] as const] : []),
    ...(selected.has('staples') ? [['staples', saveStaplesSnapshot(householdId, snapshot.stapleGroups, snapshot.staples, previous?.stapleGroups, previous?.staples, forced.has('staples'))] as const] : []),
    ...(selected.has('recipes') ? [['recipes', saveRecipeSnapshot(householdId, snapshot.recipes, previous?.recipes, forced.has('recipes'))] as const] : []),
    ...(selected.has('mealPlan') ? [['meal plan', saveMealPlanSnapshot(householdId, snapshot.mealPlan, previous?.mealPlan, forced.has('mealPlan'))] as const] : []),
    ...(selected.has('mealPlanTemplates') ? [['meal plan templates', saveMealPlanTemplateSnapshot(householdId, snapshot.mealPlanTemplates, previous?.mealPlanTemplates, forced.has('mealPlanTemplates'))] as const] : []),
  ]
  const results = await Promise.allSettled(operations.map(([, operation]) => operation))
  const failures = results.flatMap((result, index) => result.status === 'rejected'
    ? [`${operations[index][0]}: ${cloudErrorMessage(result.reason)}`]
    : [])
  if (failures.length) throw new Error(`Kitchen sync failed — ${failures.join('; ')}`)
}

function cloudErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const details = error as Record<string, unknown>
    return [details.message, details.details, details.hint, details.code].filter(Boolean).join(' · ') || 'Unknown cloud error'
  }
  return String(error)
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
