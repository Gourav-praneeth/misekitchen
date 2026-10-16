import { daysUntilExpiration } from './freshness'
import { normalizeFoodName } from './smartEntry'
import type { InventoryItem, RecipeIngredient } from './types'

export function hasIngredient(inventory: InventoryItem[], ingredient: Pick<RecipeIngredient, 'name'>) {
  const target = normalizeFoodName(ingredient.name)
  return inventory.some((item) => normalizeFoodName(item.name) === target)
}

function preferredItem(left: InventoryItem, right: InventoryItem) {
  const leftDays = daysUntilExpiration(left)
  const rightDays = daysUntilExpiration(right)
  const expiration = leftDays === null ? right : rightDays === null ? left : leftDays <= rightDays ? left : right
  return {
    ...expiration,
    id: left.id,
    name: left.name.length >= right.name.length ? left.name : right.name,
    emoji: right.emoji === '🥫' ? left.emoji : right.emoji,
    quantity: 1,
    unit: 'item',
    barcode: right.barcode || left.barcode || null,
    brand: right.brand || left.brand || null,
    productImageUrl: right.productImageUrl || left.productImageUrl || null,
    packageAmount: right.packageAmount || left.packageAmount || null,
    packageUnit: right.packageUnit || left.packageUnit || null,
    productSource: right.productSource || left.productSource || null,
  }
}

export function collapseInventoryPresence(inventory: InventoryItem[]) {
  const collapsed: InventoryItem[] = []
  inventory.forEach((item) => {
    const normalizedName = normalizeFoodName(item.name)
    const index = collapsed.findIndex((candidate) => normalizeFoodName(candidate.name) === normalizedName)
    const prepared = { ...item, quantity: 1, unit: 'item' }
    if (index < 0) collapsed.push(prepared)
    else collapsed[index] = preferredItem(collapsed[index], prepared)
  })
  return collapsed
}

export function removeIngredients(inventory: InventoryItem[], ingredients: Array<Pick<RecipeIngredient, 'name'>>) {
  const removed = new Set(ingredients.map((ingredient) => normalizeFoodName(ingredient.name)))
  return inventory.filter((item) => !removed.has(normalizeFoodName(item.name)))
}
