import type { GroceryItem, GroceryStaple, GroceryStapleGroup, InventoryItem, MealPlanEntry, MealPlanTemplate, Recipe } from './types'

export type KitchenCollection = 'inventory' | 'grocery' | 'staples' | 'recipes' | 'mealPlan' | 'mealPlanTemplates'

export type CollaborativeKitchenSnapshot = {
  inventory: InventoryItem[]
  grocery: GroceryItem[]
  stapleGroups: GroceryStapleGroup[]
  staples: GroceryStaple[]
  recipes: Recipe[]
  mealPlan: MealPlanEntry[]
  mealPlanTemplates: MealPlanTemplate[]
}

export type KitchenFingerprints = Record<KitchenCollection, string>

function stableRows<T extends { id?: string; name?: string }>(rows: T[]) {
  return [...rows].sort((left, right) => String(left.id || left.name || '').localeCompare(String(right.id || right.name || '')))
}

export function kitchenFingerprints(snapshot: CollaborativeKitchenSnapshot): KitchenFingerprints {
  return {
    inventory: JSON.stringify(stableRows(snapshot.inventory)),
    // Emoji, purchase-review details, and creation metadata are presentation or
    // server-owned fields; only fingerprint columns written by saveGrocerySnapshot.
    grocery: JSON.stringify(stableRows(snapshot.grocery.map((item) => ({
      id: item.id, name: item.name, amount: item.amount, unit: item.unit, checked: item.checked,
    })))),
    staples: JSON.stringify({ groups: stableRows(snapshot.stapleGroups), items: stableRows(snapshot.staples) }),
    recipes: JSON.stringify(stableRows(snapshot.recipes)),
    mealPlan: JSON.stringify(stableRows(snapshot.mealPlan)),
    mealPlanTemplates: JSON.stringify(stableRows(snapshot.mealPlanTemplates)),
  }
}

export function changedKitchenCollections(current: KitchenFingerprints, baseline: Partial<KitchenFingerprints>, forceAll = false): KitchenCollection[] {
  return (Object.keys(current) as KitchenCollection[]).filter((collection) => forceAll || current[collection] !== baseline[collection])
}

export function acceptKitchenCollections(baseline: Partial<KitchenFingerprints>, current: KitchenFingerprints, collections: KitchenCollection[]) {
  const next = { ...baseline }
  collections.forEach((collection) => { next[collection] = current[collection] })
  return next
}

export function unseenGroceryItemIds(items: GroceryItem[], userId: string, lastSeenAt: string | null, now = Date.now()) {
  const cutoff = lastSeenAt ? new Date(lastSeenAt).getTime() : now
  return new Set(items.flatMap((item) => {
    if (!item.id || !item.createdBy || item.createdBy === userId || !item.createdAt) return []
    return new Date(item.createdAt).getTime() > cutoff ? [item.id] : []
  }))
}
