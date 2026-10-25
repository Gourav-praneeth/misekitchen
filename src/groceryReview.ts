import { mergeGroceryItems } from './inventoryIntelligence'
import type { GroceryItem } from './types'

export type GroceryReviewStatus = 'new' | 'merge-existing' | 'merge-draft'

export function isValidGroceryReviewItem(item: GroceryItem) {
  return Boolean(item.name.trim() && Number.isFinite(item.amount) && item.amount > 0 && item.unit.trim())
}

export function groceryReviewStatuses(existing: GroceryItem[], drafts: GroceryItem[]): GroceryReviewStatus[] {
  let preview = existing.map((item) => ({ ...item }))

  return drafts.map((item) => {
    const mergesWithExisting = mergeGroceryItems(existing, [item]).length === existing.length
    const next = mergeGroceryItems(preview, [item])
    const status: GroceryReviewStatus = mergesWithExisting
      ? 'merge-existing'
      : next.length === preview.length
        ? 'merge-draft'
        : 'new'
    preview = next
    return status
  })
}

export function cleanGroceryReviewItems(items: GroceryItem[]) {
  return items.map((item) => ({ ...item, name: item.name.trim(), unit: item.unit.trim(), checked: false }))
}
