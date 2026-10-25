import type { GroceryItem, GroceryStaple, GroceryStapleGroup, InventoryItem, MealPlanEntry, MealPlanTemplate, Recipe } from './types'

export type KitchenCollection = 'inventory' | 'grocery' | 'staples' | 'recipes' | 'mealPlan' | 'mealPlanTemplates'
export type ForcedCollectionVersions = Partial<Record<KitchenCollection, number>>

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

export function acceptKitchenSnapshot(baseline: CollaborativeKitchenSnapshot | null, current: CollaborativeKitchenSnapshot, collections: KitchenCollection[]) {
  if (!baseline) return current
  const selected = new Set(collections)
  return {
    inventory: selected.has('inventory') ? current.inventory : baseline.inventory,
    grocery: selected.has('grocery') ? current.grocery : baseline.grocery,
    stapleGroups: selected.has('staples') ? current.stapleGroups : baseline.stapleGroups,
    staples: selected.has('staples') ? current.staples : baseline.staples,
    recipes: selected.has('recipes') ? current.recipes : baseline.recipes,
    mealPlan: selected.has('mealPlan') ? current.mealPlan : baseline.mealPlan,
    mealPlanTemplates: selected.has('mealPlanTemplates') ? current.mealPlanTemplates : baseline.mealPlanTemplates,
  }
}

export function changedSnapshotRows<T extends { id: string }>(current: T[], previous?: T[], force = false) {
  if (!previous || force) return current
  const baseline = new Map(previous.map((row) => [row.id, JSON.stringify(row)]))
  return current.filter((row) => baseline.get(row.id) !== JSON.stringify(row))
}

export function removedSnapshotRowIds<T extends { id: string }>(current: T[], previous?: T[]) {
  if (!previous) return []
  const currentIds = new Set(current.map((row) => row.id))
  return previous.flatMap((row) => currentIds.has(row.id) ? [] : [row.id])
}

export function forceKitchenCollections(current: ForcedCollectionVersions, collections: KitchenCollection[]) {
  const next = { ...current }
  collections.forEach((collection) => { next[collection] = (next[collection] || 0) + 1 })
  return next
}

export function pendingForcedCollections(current: ForcedCollectionVersions) {
  return (Object.keys(current) as KitchenCollection[]).filter((collection) => Boolean(current[collection]))
}

export function acknowledgeForcedCollections(current: ForcedCollectionVersions, saved: ForcedCollectionVersions) {
  const next = { ...current }
  ;(Object.keys(saved) as KitchenCollection[]).forEach((collection) => {
    if (next[collection] === saved[collection]) delete next[collection]
  })
  return next
}

export function unseenGroceryItemIds(items: GroceryItem[], userId: string, lastSeenAt: string | null, now = Date.now()) {
  const cutoff = lastSeenAt ? new Date(lastSeenAt).getTime() : now
  return new Set(items.flatMap((item) => {
    if (!item.id || !item.createdBy || item.createdBy === userId || !item.createdAt) return []
    return new Date(item.createdAt).getTime() > cutoff ? [item.id] : []
  }))
}
