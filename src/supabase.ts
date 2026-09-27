import { createClient } from '@supabase/supabase-js'
import type { GroceryItem, InventoryItem } from './types'

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

export async function loadCloudKitchen(householdId: string) {
  if (!supabase) return { inventory: [], grocery: [], initialized: false }
  const [inventoryResult, groceryResult, householdResult] = await Promise.all([
    supabase.from('inventory_items').select('*').eq('household_id', householdId).order('name'),
    supabase.from('grocery_items').select('*').eq('household_id', householdId).order('name'),
    supabase.from('households').select('initialized').eq('id', householdId).single(),
  ])
  if (inventoryResult.error) throw inventoryResult.error
  if (groceryResult.error) throw groceryResult.error
  if (householdResult.error) throw householdResult.error
  return {
    inventory: (inventoryResult.data || []).map((row) => ({
      id: row.id, name: row.name, emoji: row.emoji, quantity: Number(row.quantity), unit: row.unit,
      category: row.category, location: row.location, expiresIn: row.expires_in,
    })) as InventoryItem[],
    grocery: (groceryResult.data || []).map((row) => ({
      name: row.name, amount: Number(row.amount), unit: row.unit, checked: row.checked,
    })) as GroceryItem[],
    initialized: Boolean(householdResult.data.initialized),
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
      expires_in: item.expiresIn,
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
